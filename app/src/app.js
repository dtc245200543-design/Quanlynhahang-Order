
const express = require("express");
const path = require("path");
const client = require("prom-client");
const pool = require("./config/database");
const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.status(200).json({
            status: "ok",
            database: "connected"
        });
    } catch (error) {
        res.status(503).json({
            status: "error",
            database: "disconnected"
        });
    }
});

app.get("/metrics", async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
});

app.use("/api", apiRoutes);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../views/index.html"));
});

async function start() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_key VARCHAR(64)");
        await client.query("ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check");
        await client.query(`
            UPDATE orders
            SET status = CASE status
                WHEN 'Mới' THEN 'Chờ xử lý'
                WHEN 'Đang xử lý' THEN 'Đang chuẩn bị'
                ELSE status
            END
            WHERE status IN ('Mới', 'Đang xử lý')
        `);
        await client.query(`
            ALTER TABLE orders
            ADD CONSTRAINT orders_status_check
            CHECK (status IN (
                'Chờ xử lý', 'Đang chuẩn bị', 'Sẵn sàng', 'Hoàn thành', 'Đã hủy'
            ))
        `);
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS orders_request_key_unique
            ON orders (request_key) WHERE request_key IS NOT NULL
        `);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Ung dung dang chay tai cong ${PORT}`);
    });
    return server;
}

let server;
start().catch(async error => {
    console.error("Không thể khởi động ứng dụng:", error.message);
    await pool.end();
    process.exitCode = 1;
});

async function shutdown() {
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);