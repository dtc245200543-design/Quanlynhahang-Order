
const express = require("express");
const pool = require("../config/database");

const router = express.Router();

router.get("/menu", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM menu_items WHERE is_available = TRUE ORDER BY id"
        );
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
    try {
        const result = await pool.query(`
            SELECT
                o.id,
                o.status,
                o.total_amount,
                o.created_at,
                t.table_number,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'name', m.name,
                            'quantity', oi.quantity,
                            'unit_price', oi.unit_price
                        )
                    ) FILTER (WHERE oi.id IS NOT NULL),
                    '[]'
                ) AS items
            FROM orders o
            LEFT JOIN restaurant_tables t ON t.id = o.table_id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu_items m ON m.id = oi.menu_item_id
            GROUP BY o.id, t.table_number
            ORDER BY o.created_at DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Lỗi lấy đơn hàng:", error.message);
        res.status(500).json({ message: "Không thể lấy đơn hàng" });
    }
});

router.post("/orders", async (req, res) => {
    const { table_id, items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            message: "Đơn hàng phải có ít nhất một món"
        });
    }

    const normalizedItems = items.map(item => ({
        menu_item_id: Number(item.menu_item_id),
        quantity: Number(item.quantity)
    }));

    if (normalizedItems.some(item =>
        !Number.isInteger(item.menu_item_id) ||
        item.menu_item_id <= 0 ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
    )) {
        return res.status(400).json({
            message: "Mã món và số lượng không hợp lệ"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        let tableId = null;

        if (table_id !== undefined && table_id !== null) {
            tableId = Number(table_id);

            if (!Number.isInteger(tableId) || tableId <= 0) {
                throw new Error("Mã bàn không hợp lệ");
            }

            const tableResult = await client.query(
                "SELECT * FROM restaurant_tables WHERE id = $1 FOR UPDATE",
                [tableId]
            );

            if (tableResult.rowCount === 0) {
                throw new Error("Không tìm thấy bàn ăn");
            }

            if (tableResult.rows[0].status !== "Trống") {
                throw new Error("Bàn ăn hiện không trống");
            }
        }

        const orderResult = await client.query(
            `INSERT INTO orders (table_id, status, total_amount)
             VALUES ($1, 'Mới', 0)
             RETURNING id`,
            [tableId]
        );

        const orderId = orderResult.rows[0].id;
        let total = 0;

        for (const item of normalizedItems) {
            const menuResult = await client.query(
                `SELECT id, price
                 FROM menu_items
                 WHERE id = $1 AND is_available = TRUE`,
                [item.menu_item_id]
            );

            if (menuResult.rowCount === 0) {
                throw new Error(
                    `Không tìm thấy món có mã ${item.menu_item_id}`
                );
            }

            const price = Number(menuResult.rows[0].price);
            total += price * item.quantity;

            await client.query(
                `INSERT INTO order_items
                    (order_id, menu_item_id, quantity, unit_price)
                 VALUES ($1, $2, $3, $4)`,
                [orderId, item.menu_item_id, item.quantity, price]
            );
        }

        await client.query(
            "UPDATE orders SET total_amount = $1 WHERE id = $2",
            [total, orderId]
        );

        if (tableId !== null) {
            await client.query(
                `UPDATE restaurant_tables
                 SET status = 'Đang phục vụ'
                 WHERE id = $1`,
                [tableId]
            );
        }

        await client.query("COMMIT");

        res.status(201).json({
            message: "Tạo đơn hàng thành công",
            order_id: orderId,
            total_amount: total
        });
    } catch (error) {
        await client.query("ROLLBACK");

        const clientErrorMessages = [
            "Mã bàn không hợp lệ",
            "Không tìm thấy bàn ăn",
            "Bàn ăn hiện không trống"
        ];

        const status = clientErrorMessages.includes(error.message) ||
            error.message.startsWith("Không tìm thấy món")
            ? 400
            : 500;

        console.error("Lỗi tạo đơn hàng:", error.message);

        res.status(status).json({
            message: status === 400
                ? error.message
                : "Không thể tạo đơn hàng"
        });
    } finally {
        client.release();
    }
});

module.exports = router;