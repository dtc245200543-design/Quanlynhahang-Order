
-- This script runs on a new volume and can also be safely applied to an existing database.
\getenv app_user DB_USER
\getenv app_password DB_PASSWORD
\getenv exporter_user DB_EXPORTER_USER
\getenv exporter_password DB_EXPORTER_PASSWORD
\getenv database_name POSTGRES_DB

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'exporter_user', :'exporter_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'exporter_user') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'exporter_user', :'exporter_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'exporter_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'app_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database_name', :'exporter_user') \gexec
SELECT format('GRANT pg_monitor TO %I', :'exporter_user') \gexec

ALTER SCHEMA public OWNER TO :"app_user";
SET ROLE :"app_user";

CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    category VARCHAR(100),
    is_available BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
    id SERIAL PRIMARY KEY,
    table_number INTEGER NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'Trống'
        CHECK (status IN ('Trống', 'Đã đặt', 'Đang phục vụ'))
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    table_id INTEGER REFERENCES restaurant_tables(id),
    status VARCHAR(30) NOT NULL DEFAULT 'Mới'
        CHECK (status IN ('Mới', 'Đang xử lý', 'Hoàn thành', 'Đã hủy')),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0)
);

INSERT INTO menu_items (name, price, category)
SELECT seed.name, seed.price, seed.category
FROM (VALUES
    ('Phở bò', 45000, 'Món chính'),
    ('Cơm gà', 50000, 'Món chính'),
    ('Bún chả', 40000, 'Món chính'),
    ('Nước cam', 25000, 'Đồ uống')
) AS seed(name, price, category)
WHERE NOT EXISTS (
    SELECT 1 FROM menu_items existing WHERE existing.name = seed.name
);

INSERT INTO restaurant_tables (table_number, status)
VALUES
    (1, 'Trống'),
    (2, 'Đang phục vụ'),
    (3, 'Trống'),
    (4, 'Đã đặt')
ON CONFLICT (table_number) DO NOTHING;

RESET ROLE;