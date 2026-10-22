window.history.scrollRestoration = "manual";

const menuList = document.getElementById("menu-list");
const orderList = document.getElementById("order-list");
const tableList = document.getElementById("table-list");
const message = document.getElementById("app-message");
const orderDialog = document.getElementById("order-dialog");
const cartList = document.getElementById("cart-list");
const cartEmpty = document.getElementById("cart-empty");
const dialogMessage = document.getElementById("dialog-message");
const navLinks = [...document.querySelectorAll(".navbar .nav-link")];
const navSections = navLinks
    .map(link => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
const menuImages = {
    "pho bo": "/images/pho-bo.jpg",
    "bun cha": "/images/bun-cha.jpg",
    "com ga": "/images/com-ga.jpg",
    "nuoc cam": "/images/nuoc-cam.jpg",
    "com suon nuong": "/images/com-suon-nuong.jpg",
    "duong chi cam lo": "/images/duong-chi-cam-lo.jpg"
};
const state = {
    menu: [],
    tables: [],
    cart: new Map(),
    requestKey: null,
    submitting: false
};

function setActiveNavLink(link) {
    navLinks.forEach(navLink => {
        const active = navLink === link;
        navLink.classList.toggle("active", active);
        if (active) {
            navLink.setAttribute("aria-current", "page");
        } else {
            navLink.removeAttribute("aria-current");
        }
    });
    const navbar = document.querySelector(".navbar");
    const navBounds = navbar.getBoundingClientRect();
    const labelRange = document.createRange();
    labelRange.selectNodeContents(link);
    const labelBounds = labelRange.getBoundingClientRect();
    navbar.style.setProperty("--indicator-left", `${labelBounds.left - navBounds.left}px`);
    navbar.style.setProperty("--indicator-width", `${labelBounds.width}px`);
}

function updateActiveNavLink() {
    const stickyOffset = Number.parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingTop
    ) + 4;
    let activeSection = navSections[0];
    const atPageEnd = window.innerHeight + window.scrollY
        >= document.documentElement.scrollHeight - 2;
    if (atPageEnd) {
        activeSection = navSections[navSections.length - 1];
    } else {
        navSections.forEach(section => {
            if (section.getBoundingClientRect().top <= stickyOffset) {
                activeSection = section;
            }
        });
    }
    const activeLink = navLinks.find(link => link.hash === `#${activeSection.id}`);
    if (activeLink) {
        setActiveNavLink(activeLink);
    }
}

let navUpdatePending = false;
window.addEventListener("scroll", () => {
    if (navUpdatePending) {
        return;
    }
    navUpdatePending = true;
    window.requestAnimationFrame(() => {
        updateActiveNavLink();
        navUpdatePending = false;
    });
}, { passive: true });
navLinks.forEach(link => link.addEventListener("click", () => setActiveNavLink(link)));
window.addEventListener("resize", updateActiveNavLink);

if (window.location.hash) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}
window.scrollTo(0, 0);
setActiveNavLink(navLinks[0]);

async function apiRequest(path, options = {}) {
    const response = await fetch(`/api/${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options
    });
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error("Máy chủ trả về dữ liệu không hợp lệ");
    }
    if (!response.ok) {
        throw new Error(data.message || "Yêu cầu không thành công");
    }
    return data;
}

function formatMoney(value) {
    return `${Number(value).toLocaleString("vi-VN")} ₫`;
}

function moneyInCents(value) {
    return Math.round(Number(value) * 100);
}

function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
}

function makeEmptyState(text) {
    const element = document.createElement("p");
    element.className = "empty-state";
    element.textContent = text;
    return element;
}

function populateCategories() {
    const select = document.getElementById("category-filter");
    const selected = select.value;
    select.replaceChildren(new Option("Tất cả danh mục", ""));
    [...new Set(state.menu.map(item => item.category).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, "vi"))
        .forEach(category => select.add(new Option(category, category)));
    if ([...select.options].some(option => option.value === selected)) {
        select.value = selected;
    }
}

function renderMenu() {
    menuList.replaceChildren();
    const search = document.getElementById("menu-search").value.trim().toLocaleLowerCase("vi");
    const category = document.getElementById("category-filter").value;
    const visibleItems = state.menu.filter(item =>
        item.name.toLocaleLowerCase("vi").includes(search) &&
        (!category || item.category === category)
    );

    if (visibleItems.length === 0) {
        menuList.append(makeEmptyState(
            state.menu.length ? "Không tìm thấy món phù hợp." : "Thực đơn hiện chưa có món."
        ));
    }

    visibleItems.forEach(item => {
        const card = document.createElement("article");
        card.className = "menu-item";
        if (!item.is_available) {
            card.classList.add("sold-out");
        }
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

        const categoryLabel = document.createElement("span");
        categoryLabel.className = "menu-category";
        categoryLabel.textContent = item.category || "Chưa phân loại";
        const name = document.createElement("h3");
        name.textContent = item.name;
        const availability = document.createElement("span");
        availability.className = `availability ${item.is_available ? "available" : "unavailable"}`;
        availability.textContent = item.is_available ? "Còn món" : "Hết món";
        const price = document.createElement("p");
        price.className = "menu-price";
        price.textContent = formatMoney(item.price);
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.is_available ? "＋ Thêm vào đơn" : "Tạm hết món";
        button.disabled = !item.is_available;
        button.addEventListener("click", () => addToCart(item.id));
        card.append(categoryLabel, name, availability, price, button);
        menuList.append(card);
    });
}

function renderTables() {
    tableList.replaceChildren();
    if (state.tables.length === 0) {
        tableList.append(makeEmptyState("Chưa có dữ liệu bàn ăn."));
    }

    state.tables.forEach(table => {
        const card = document.createElement("article");
        card.className = "table-item";
        if (table.status === "Trống") {
            card.classList.add("available");
        } else if (table.status === "Đang phục vụ") {
            card.classList.add("busy");
        } else {
            card.classList.add("reserved");
        }
        const heading = document.createElement("h3");
        heading.textContent = `Bàn ${table.table_number}`;
        const status = document.createElement("p");
        status.textContent = table.status;
        card.append(heading, status);
        tableList.append(card);
    });
}

function nextStatus(status) {
    return {
        "Chờ xử lý": "Đang chuẩn bị",
        "Đang chuẩn bị": "Sẵn sàng",
        "Sẵn sàng": "Hoàn thành"
    }[status] || null;
}

function renderOrders(orders) {
    orderList.replaceChildren();
    if (orders.length === 0) {
        orderList.append(makeEmptyState("Không có đơn hàng phù hợp."));
        return;
    }

    orders.forEach(order => {
        const card = document.createElement("article");
        card.className = "order-item";
        const heading = document.createElement("strong");
        heading.textContent = `Đơn hàng #${order.id}`;
        const badge = document.createElement("span");
        badge.className = "order-status";
        badge.textContent = order.status;
        if (["Đang chuẩn bị", "Đang xử lý"].includes(order.status)) {
            badge.classList.add("order-status-processing");
        } else if (["Hoàn thành", "Sẵn sàng"].includes(order.status)) {
            badge.classList.add("order-status-complete");
        } else if (order.status === "Đã hủy") {
            badge.classList.add("order-status-cancelled");
        }
        const info = document.createElement("p");
        info.className = "order-meta";
        info.textContent = `${order.table_number ? `Bàn ${order.table_number}` : "Không gắn bàn"} · ${new Date(order.created_at).toLocaleString("vi-VN")}`;
        const itemList = document.createElement("ul");
        itemList.className = "order-detail-items";
        order.items.forEach(item => {
            const line = document.createElement("li");
            line.textContent = `${item.name} × ${item.quantity} · ${formatMoney(item.unit_price)}`;
            itemList.append(line);
        });
        const total = document.createElement("strong");
        total.className = "order-total";
        total.textContent = formatMoney(order.total_amount);
        const actions = document.createElement("div");
        actions.className = "order-actions";
        const next = nextStatus(order.status);
        if (next) {
            const updateButton = document.createElement("button");
            updateButton.type = "button";
            updateButton.className = "secondary-button compact-button";
            updateButton.textContent = `Chuyển: ${next}`;
            updateButton.addEventListener("click", () => updateOrderStatus(order.id, next, updateButton));
            actions.append(updateButton);

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "text-button";
            cancelButton.textContent = "Hủy đơn";
            cancelButton.addEventListener("click", () => updateOrderStatus(order.id, "Đã hủy", cancelButton));
            actions.append(cancelButton);
        }
        card.append(heading, badge, info, itemList, total, actions);
        orderList.append(card);
    });
}

function renderSummary(summary) {
    document.getElementById("today-orders").textContent = Number(summary.today_orders).toLocaleString("vi-VN");
    document.getElementById("today-revenue").textContent = formatMoney(summary.today_revenue);
    document.getElementById("free-tables").textContent = Number(summary.free_tables).toLocaleString("vi-VN");
    document.getElementById("active-orders").textContent = Number(summary.active_orders).toLocaleString("vi-VN");
}

async function refreshDashboard({ quiet = false } = {}) {
    if (!quiet) {
        menuList.setAttribute("aria-busy", "true");
        orderList.setAttribute("aria-busy", "true");
        if (!state.menu.length) {
            menuList.replaceChildren(makeEmptyState("Đang tải thực đơn..."));
        }
    }
    try {
        const search = document.getElementById("order-search").value.trim();
        const status = document.getElementById("status-filter").value;
        const query = new URLSearchParams({ search, status });
        const [summary, menu, tables, orders] = await Promise.all([
            apiRequest("summary"),
            apiRequest("menu"),
            apiRequest("tables"),
            apiRequest(`orders?${query}`)
        ]);
        state.menu = menu;
        state.tables = tables;
        renderSummary(summary);
        populateCategories();
        renderMenu();
        renderTables();
        renderOrders(orders);
        return true;
    } catch (error) {
        showMessage(`Không thể tải dữ liệu: ${error.message}`, true);
        if (!state.menu.length) {
            menuList.replaceChildren(makeEmptyState("Không tải được thực đơn. Vui lòng thử tải lại."));
        }
        return false;
    } finally {
        menuList.removeAttribute("aria-busy");
        orderList.removeAttribute("aria-busy");
    }
}

function setRequestKeyInvalid() {
    state.requestKey = null;
    document.getElementById("order-review").hidden = true;
    document.getElementById("review-order").hidden = false;
}

function addToCart(menuItemId) {
    const item = state.menu.find(menuItem => menuItem.id === menuItemId);
    if (!item || !item.is_available) {
        showMessage("Món này hiện không còn bán.", true);
        return;
    }
    const current = state.cart.get(menuItemId);
    if (current && current.quantity >= 99) {
        showMessage("Số lượng tối đa của mỗi món là 99.", true);
        return;
    }
    state.cart.set(menuItemId, {
        item,
        quantity: current ? current.quantity + 1 : 1
    });
    setRequestKeyInvalid();
    renderCart();
    showMessage(`Đã thêm ${item.name} vào đơn.`);
    if (!orderDialog.open) {
        renderTableOptions();
        orderDialog.showModal();
    }
}

function changeQuantity(menuItemId, difference) {
    const entry = state.cart.get(menuItemId);
    if (!entry) {
        return;
    }
    const quantity = entry.quantity + difference;
    if (quantity <= 0) {
        state.cart.delete(menuItemId);
    } else if (quantity <= 99) {
        entry.quantity = quantity;
    } else {
        return;
    }
    setRequestKeyInvalid();
    renderCart();
}

function renderCart() {
    cartList.replaceChildren();
    cartEmpty.hidden = state.cart.size > 0;
    document.getElementById("review-order").disabled =
        state.cart.size === 0 || state.submitting;
    let total = 0;
    let quantityCount = 0;
    state.cart.forEach(({ item, quantity }, id) => {
        total += moneyInCents(item.price) * quantity;
        quantityCount += quantity;
        const row = document.createElement("div");
        row.className = "cart-row";
        const name = document.createElement("strong");
        name.textContent = item.name;
        const price = document.createElement("span");
        price.textContent = formatMoney(moneyInCents(item.price) * quantity / 100);
        const quantityControl = document.createElement("div");
        quantityControl.className = "quantity-control";
        const decrease = document.createElement("button");
        decrease.type = "button";
        decrease.textContent = "−";
        decrease.setAttribute("aria-label", `Giảm ${item.name}`);
        decrease.addEventListener("click", () => changeQuantity(id, -1));
        const count = document.createElement("span");
        count.textContent = quantity;
        const increase = document.createElement("button");
        increase.type = "button";
        increase.textContent = "+";
        increase.setAttribute("aria-label", `Tăng ${item.name}`);
        increase.disabled = quantity >= 99;
        increase.addEventListener("click", () => changeQuantity(id, 1));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-item";
        remove.textContent = "Xóa";
        remove.addEventListener("click", () => {
            state.cart.delete(id);
            setRequestKeyInvalid();
            renderCart();
        });
        quantityControl.append(decrease, count, increase, remove);
        row.append(name, price, quantityControl);
        cartList.append(row);
    });
    document.getElementById("cart-count").textContent = `${quantityCount} món`;
    document.getElementById("cart-total").textContent = formatMoney(total / 100);
}

function renderReview() {
    const tableSelect = document.getElementById("order-table");
    const tableLabel = tableSelect.value
        ? tableSelect.selectedOptions[0].textContent
        : "Không gắn với bàn";
    const lines = [...state.cart.values()]
        .map(({ item, quantity }) => `${item.name} × ${quantity}`)
        .join(", ");
    document.getElementById("review-summary").textContent =
        `${tableLabel} · ${lines} · Tổng ${document.getElementById("cart-total").textContent}`;
    document.getElementById("order-review").hidden = false;
    document.getElementById("review-order").hidden = true;
}

async function updateOrderStatus(orderId, status, button) {
    button.disabled = true;
    try {
        const result = await apiRequest(`orders/${orderId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        });
        showMessage(result.message);
        await refreshDashboard({ quiet: true });
    } catch (error) {
        showMessage(`Không thể cập nhật đơn: ${error.message}`, true);
    } finally {
        button.disabled = false;
    }
}

async function confirmOrder(button) {
    if (state.submitting || state.cart.size === 0) {
        return;
    }
    state.submitting = true;
    orderDialog.querySelectorAll("button, select").forEach(control => {
        control.disabled = true;
    });
    dialogMessage.textContent = "Đang lưu đơn hàng...";
    dialogMessage.classList.remove("error");
    const payload = {
        request_key: state.requestKey || (window.crypto.randomUUID
            ? window.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
        table_id: document.getElementById("order-table").value || null,
        items: [...state.cart].map(([menu_item_id, entry]) => ({
            menu_item_id,
            quantity: entry.quantity
        }))
    };
    state.requestKey = payload.request_key;
    try {
        const result = await apiRequest("orders", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        dialogMessage.textContent = `${result.message} (#${result.order_id}).`;
        dialogMessage.classList.remove("error");
        state.cart.clear();
        state.requestKey = null;
        renderCart();
        await refreshDashboard({ quiet: true });
        window.setTimeout(() => orderDialog.close(), 700);
    } catch (error) {
        dialogMessage.textContent = `Không thể tạo đơn: ${error.message}`;
        dialogMessage.classList.add("error");
    } finally {
        state.submitting = false;
        orderDialog.querySelectorAll("button, select").forEach(control => {
            control.disabled = false;
        });
        button.disabled = false;
        renderCart();
    }
}

function renderTableOptions() {
    const select = document.getElementById("order-table");
    const previousValue = select.value;
    select.replaceChildren(new Option("Không gắn với bàn", ""));
    state.tables.filter(table => table.status === "Trống").forEach(table => {
        select.add(new Option(`Bàn ${table.table_number}`, table.id));
    });
    if ([...select.options].some(option => option.value === previousValue)) {
        select.value = previousValue;
    }
    document.getElementById("dialog-table-hint").textContent =
        state.tables.some(table => table.status === "Trống")
            ? "Chỉ những bàn đang trống mới khả dụng."
            : "Hiện không có bàn trống; bạn vẫn có thể tạo đơn không gắn bàn.";
}

document.getElementById("menu-search").addEventListener("input", renderMenu);
document.getElementById("category-filter").addEventListener("change", renderMenu);
document.getElementById("order-search").addEventListener("input", () => {
    window.clearTimeout(orderSearchTimer);
    orderSearchTimer = window.setTimeout(() => refreshDashboard({ quiet: true }), 250);
});
document.getElementById("status-filter").addEventListener("change", () =>
    refreshDashboard({ quiet: true })
);
document.getElementById("new-order-button").addEventListener("click", () => {
    dialogMessage.textContent = "";
    renderTableOptions();
    renderCart();
    orderDialog.showModal();
});
document.getElementById("close-order-dialog").addEventListener("click", () => orderDialog.close());
document.getElementById("continue-menu").addEventListener("click", () => {
    orderDialog.close();
    document.getElementById("menu").scrollIntoView({ behavior: "smooth" });
});
document.getElementById("review-order").addEventListener("click", renderReview);
document.getElementById("edit-order").addEventListener("click", () => {
    document.getElementById("order-review").hidden = true;
    document.getElementById("review-order").hidden = false;
});
document.getElementById("confirm-order").addEventListener("click", event =>
    confirmOrder(event.currentTarget)
);
document.getElementById("order-table").addEventListener("change", setRequestKeyInvalid);
orderDialog.addEventListener("close", () => {
    dialogMessage.textContent = "";
    dialogMessage.classList.remove("error");
});
let orderSearchTimer = 0;

menuList.append(makeEmptyState("Đang tải thực đơn..."));
orderList.append(makeEmptyState("Đang tải đơn hàng..."));
refreshDashboard();
window.setInterval(() => refreshDashboard({ quiet: true }), 30000);
