const menuList = document.getElementById("menu-list");
const orderList = document.getElementById("order-list");
const tableList = document.getElementById("table-list");
const tableSelect = document.getElementById("table-select");
const message = document.getElementById("app-message");
const menuImages = {
    "pho bo": "/images/pho-bo.jpg",
    "bun cha": "/images/bun-cha.jpg",
    "com ga": "/images/com-ga.jpg",
    "nuoc cam": "/images/nuoc-cam.jpg"
};

async function apiRequest(path, options = {}) {
    const response = await fetch(`/api/${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || "Yêu cầu không thành công");
    }

    return data;
}

function renderMenu(items) {
    menuList.replaceChildren();

    if (items.length === 0) {
        menuList.textContent = "Hiện chưa có món ăn khả dụng.";
    }

    items.forEach(item => {
        const card = document.createElement("article");
        card.className = "menu-item";

        const imageSource = menuImages[item.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()];
        if (imageSource) {
            card.classList.add("menu-item-with-photo");
            const image = document.createElement("img");
            image.className = "menu-photo";
            image.src = imageSource;
            image.alt = item.name;
            image.loading = "lazy";
            image.decoding = "async";
            card.append(image);
        }

        const name = document.createElement("h3");
        name.textContent = item.name;

        const category = document.createElement("p");
        category.textContent = item.category || "Chưa phân loại";

        const price = document.createElement("p");
        price.textContent = `${Number(item.price).toLocaleString("vi-VN")} VNĐ`;

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Tạo đơn hàng";
        button.addEventListener("click", () => createOrder(item.id, button));

        card.append(name, category, price, button);
        menuList.append(card);
    });

    document.getElementById("menu-count").textContent = items.length;
}

function renderTables(tables) {
    tableList.replaceChildren();
    const availableTables = tables.filter(table => table.status === "Trống");

    tableSelect.replaceChildren();
    const noTableOption = document.createElement("option");
    noTableOption.value = "";
    noTableOption.textContent = "Không gắn với bàn";
    tableSelect.append(noTableOption);

    availableTables.forEach(table => {
        const option = document.createElement("option");
        option.value = table.id;
        option.textContent = `Bàn ${table.table_number}`;
        tableSelect.append(option);
    });

    tables.forEach(table => {
        const card = document.createElement("article");
        card.className = "table-item";
        const heading = document.createElement("h3");
        heading.textContent = `Bàn ${table.table_number}`;
        const status = document.createElement("p");
        status.textContent = `Trạng thái: ${table.status}`;
        card.append(heading, status);
        tableList.append(card);
    });

    document.getElementById("table-count").textContent = tables.length;
}

function renderOrders(orders) {
    orderList.replaceChildren();

    if (orders.length === 0) {
        orderList.textContent = "Chưa có đơn hàng.";
    }

    orders.forEach(order => {
        const card = document.createElement("article");
        card.className = "order-item";

        const heading = document.createElement("strong");
        heading.textContent = `Đơn hàng #${order.id}`;
        const table = document.createElement("p");
        table.textContent = order.table_number
            ? `Bàn ${order.table_number} · ${order.status}`
            : `Không gắn bàn · ${order.status}`;
        const items = document.createElement("p");
        items.textContent = order.items
            .map(item => `${item.name} × ${item.quantity}`)
            .join(", ");
        const total = document.createElement("p");
        total.textContent = `Tổng: ${Number(order.total_amount).toLocaleString("vi-VN")} VNĐ`;
        const time = document.createElement("p");
        time.textContent = `Thời gian: ${new Date(order.created_at).toLocaleString("vi-VN")}`;

        card.append(heading, table, items, total, time);
        orderList.append(card);
    });

    document.getElementById("order-count").textContent = orders.length;
}

async function refreshDashboard() {
    const [menu, tables, orders] = await Promise.all([
        apiRequest("menu"),
        apiRequest("tables"),
        apiRequest("orders")
    ]);

    renderMenu(menu);
    renderTables(tables);
    renderOrders(orders);
}

async function createOrder(menuItemId, button) {
    button.disabled = true;
    message.textContent = "Đang tạo đơn hàng...";

    const payload = {
        items: [{ menu_item_id: menuItemId, quantity: 1 }]
    };
    if (tableSelect.value) {
        payload.table_id = Number(tableSelect.value);
    }

    try {
        const result = await apiRequest("orders", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        message.textContent = `${result.message} (#${result.order_id}).`;
        await refreshDashboard();
    } catch (error) {
        message.textContent = `Lỗi: ${error.message}`;
    } finally {
        button.disabled = false;
    }
}

refreshDashboard().catch(error => {
    message.textContent = `Không thể tải dữ liệu: ${error.message}`;
});
