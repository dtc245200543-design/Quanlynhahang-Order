const express = require("express");
const pool = require("../config/database");

const router = express.Router();
const ORDER_STATUSES = [
    "Chờ xử lý",
    "Đang chuẩn bị",
    "Sẵn sàng",
    "Hoàn thành",
    "Đã hủy"
];
const NEXT_STATUS = {
    "Chờ xử lý": "Đang chuẩn bị",
    "Đang chuẩn bị": "Sẵn sàng",
    "Sẵn sàng": "Hoàn thành"
};
const ACTIVE_STATUSES = ["Chờ xử lý", "Đang chuẩn bị", "Sẵn sàng"];

router.get("/summary", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM orders
                 WHERE created_at >= CURRENT_DATE
                   AND created_at < CURRENT_DATE + INTERVAL '1 day') AS today_orders,
                (SELECT COALESCE(SUM(total_amount), 0) FROM orders
                 WHERE created_at >= CURRENT_DATE
                   AND created_at < CURRENT_DATE + INTERVAL '1 day'
                   AND status <> 'Đã hủy') AS today_revenue,
                (SELECT COUNT(*) FROM restaurant_tables WHERE status = 'Trống') AS free_tables,
                (SELECT COUNT(*) FROM orders WHERE status = ANY($1::text[])) AS active_orders
        `, [ACTIVE_STATUSES]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Lỗi lấy tổng quan:", error.message);
        res.status(500).json({ message: "Không thể tải số liệu tổng quan" });
    }
});

router.get("/menu", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM menu_items ORDER BY id");
        res.json(result.rows);
    } catch (error) {
        console.error("Lỗi lấy thực đơn:", error.message);
        res.status(500).json({ message: "Không thể lấy thực đơn" });
    }
});

router.get("/tables", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM restaurant_tables ORDER BY table_number"
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Lỗi lấy bàn ăn:", error.message);
        res.status(500).json({ message: "Không thể lấy danh sách bàn" });
    }
});

router.get("/orders", async (req, res) => {
    const { status = "", search = "" } = req.query;
    if (status && !ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Trạng thái lọc không hợp lệ" });
    }
    if (search && !/^\d+$/.test(search)) {
        return res.status(400).json({ message: "Mã đơn chỉ được chứa chữ số" });
    }

    try {
        const result = await pool.query(`
            SELECT
                o.id, o.status, o.total_amount, o.created_at, o.table_id,
                t.table_number,
                COALESCE(
                    json_agg(json_build_object(
                        'menu_item_id', m.id,
                        'name', m.name,
                        'quantity', oi.quantity,
                        'unit_price', oi.unit_price
                    )) FILTER (WHERE oi.id IS NOT NULL),
                    '[]'
                ) AS items
            FROM orders o
            LEFT JOIN restaurant_tables t ON t.id = o.table_id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu_items m ON m.id = oi.menu_item_id
            WHERE ($1 = '' OR o.status = $1)
              AND ($2 = '' OR o.id::text = $2)
            GROUP BY o.id, t.table_number
            ORDER BY o.created_at DESC
            LIMIT 100
        `, [status, search]);
        res.json(result.rows);
    } catch (error) {
        console.error("Lỗi lấy đơn hàng:", error.message);
        res.status(500).json({ message: "Không thể lấy đơn hàng" });
    }
});

router.post("/orders", async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        return res.status(400).json({ message: "Thông tin đơn hàng không hợp lệ" });
    }
    const { table_id: requestedTableId, items, request_key: requestKey } = req.body;

    if (typeof requestKey !== "string" || !/^[\w-]{16,64}$/.test(requestKey)) {
        return res.status(400).json({ message: "Mã yêu cầu tạo đơn không hợp lệ" });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        return res.status(400).json({
            message: "Đơn hàng phải có từ 1 đến 50 món"
        });
    }

    const quantities = new Map();
    for (const item of items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            return res.status(400).json({ message: "Thông tin món hàng không hợp lệ" });
        }
        const menuItemId = Number(item.menu_item_id);
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(menuItemId) || menuItemId <= 0 ||
            menuItemId > 2147483647 ||
            !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 99) {
            return res.status(400).json({
                message: "Mã món hoặc số lượng không hợp lệ (số lượng tối đa 99)"
            });
        }
        quantities.set(menuItemId, (quantities.get(menuItemId) || 0) + quantity);
        if (quantities.get(menuItemId) > 99) {
            return res.status(400).json({
                message: "Số lượng mỗi món không được vượt quá 99"
            });
        }
    }

    let tableId = null;
    if (requestedTableId !== undefined && requestedTableId !== null &&
        requestedTableId !== "") {
        tableId = Number(requestedTableId);
        if (!Number.isSafeInteger(tableId) || tableId <= 0 || tableId > 2147483647) {
            return res.status(400).json({ message: "Mã bàn không hợp lệ" });
        }
    }

    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const inserted = await client.query(
            `INSERT INTO orders (table_id, status, total_amount, request_key)
             VALUES ($1, 'Chờ xử lý', 0, $2)
             ON CONFLICT (request_key) WHERE request_key IS NOT NULL DO NOTHING
             RETURNING id`,
            [tableId, requestKey]
        );

        if (inserted.rowCount === 0) {
            const existing = await client.query(
                "SELECT id, total_amount FROM orders WHERE request_key = $1",
                [requestKey]
            );
            await client.query("COMMIT");
            return res.status(200).json({
                message: "Đơn hàng này đã được tạo trước đó",
                order_id: existing.rows[0].id,
                total_amount: existing.rows[0].total_amount,
                duplicate: true
            });
        }

        const orderId = inserted.rows[0].id;
        if (tableId !== null) {
            const tableResult = await client.query(
                "SELECT status FROM restaurant_tables WHERE id = $1 FOR UPDATE",
                [tableId]
            );
            if (tableResult.rowCount === 0) {
                throw new Error("Không tìm thấy bàn ăn");
            }
            if (tableResult.rows[0].status !== "Trống") {
                throw new Error("Bàn ăn hiện không trống");
            }
        }

        const itemIds = [...quantities.keys()];
        const menuResult = await client.query(
            `SELECT id, price, is_available
             FROM menu_items
             WHERE id = ANY($1::int[])
             ORDER BY id
             FOR SHARE`,
            [itemIds]
        );
        const menuById = new Map(menuResult.rows.map(item => [item.id, item]));
        if (menuById.size !== itemIds.length) {
            throw new Error("Không tìm thấy một hoặc nhiều món đã chọn");
        }
        for (const itemId of itemIds) {
            if (!menuById.get(itemId).is_available) {
                throw new Error(`Món có mã ${itemId} hiện đã hết`);
            }
            await client.query(
                `INSERT INTO order_items
                    (order_id, menu_item_id, quantity, unit_price)
                 VALUES ($1, $2, $3, $4)`,
                [orderId, itemId, quantities.get(itemId), menuById.get(itemId).price]
            );
        }

        const totalResult = await client.query(
            `UPDATE orders
             SET total_amount = (
                SELECT COALESCE(SUM(unit_price * quantity), 0)
                FROM order_items WHERE order_id = $1
             )
             WHERE id = $1
             RETURNING total_amount`,
            [orderId]
        );
        if (tableId !== null) {
            await client.query(
                "UPDATE restaurant_tables SET status = 'Đang phục vụ' WHERE id = $1",
                [tableId]
            );
        }
        await client.query("COMMIT");
        res.status(201).json({
            message: "Tạo đơn hàng thành công",
            order_id: orderId,
            total_amount: totalResult.rows[0].total_amount
        });
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK");
        }
        const clientErrors = [
            "Mã bàn không hợp lệ",
            "Không tìm thấy bàn ăn",
            "Bàn ăn hiện không trống",
            "Không tìm thấy một hoặc nhiều món đã chọn"
        ];
        const isClientError = clientErrors.includes(error.message) ||
            error.message.startsWith("Món có mã");
        console.error("Lỗi tạo đơn hàng:", error.message);
        res.status(isClientError ? 400 : 500).json({
            message: isClientError ? error.message : "Không thể tạo đơn hàng"
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});

router.patch("/orders/:id/status", async (req, res) => {
    const orderId = Number(req.params.id);
    const status = req.body && req.body.status;
    if (!Number.isSafeInteger(orderId) || orderId <= 0 || orderId > 2147483647 ||
        !ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Mã đơn hoặc trạng thái không hợp lệ" });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");
        const result = await client.query(
            `SELECT o.status, o.table_id
             FROM orders o
             WHERE o.id = $1
             FOR UPDATE`,
            [orderId]
        );
        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
        }

        const currentStatus = result.rows[0].status;
        const isCancellation = status === "Đã hủy" &&
            !["Hoàn thành", "Đã hủy"].includes(currentStatus);
        if (NEXT_STATUS[currentStatus] !== status && !isCancellation) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: currentStatus === "Hoàn thành" || currentStatus === "Đã hủy"
                    ? "Đơn hàng đã kết thúc, không thể cập nhật tiếp"
                    : "Chỉ được chuyển đơn sang bước kế tiếp hoặc hủy đơn"
            });
        }

        await client.query("UPDATE orders SET status = $1 WHERE id = $2", [
            status,
            orderId
        ]);
        const tableId = result.rows[0].table_id;
        if (tableId !== null) {
            const stillActive = ACTIVE_STATUSES.includes(status);
            if (stillActive) {
                await client.query(
                    "UPDATE restaurant_tables SET status = 'Đang phục vụ' WHERE id = $1",
                    [tableId]
                );
            } else {
                await client.query(
                    `UPDATE restaurant_tables t
                     SET status = CASE
                         WHEN EXISTS (
                             SELECT 1 FROM orders o
                             WHERE o.table_id = t.id AND o.status = ANY($2::text[])
                         ) THEN 'Đang phục vụ'
                         ELSE 'Trống'
                     END
                     WHERE t.id = $1`,
                    [tableId, ACTIVE_STATUSES]
                );
            }
        }
        await client.query("COMMIT");
        res.json({ message: "Cập nhật trạng thái đơn hàng thành công", status });
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK");
        }
        console.error("Lỗi cập nhật đơn hàng:", error.message);
        res.status(500).json({ message: "Không thể cập nhật trạng thái đơn hàng" });
    } finally {
        if (client) {
            client.release();
        }
    }
});

module.exports = router;
