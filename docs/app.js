/* ShopCart frontend - vanilla JS, talks to the Spring Boot REST API. */

const STATUS_FLOW = ["PLACED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

/* The storefront is also published as a static site (GitHub Pages), so the API host comes
   from docs/config.js instead of being hardcoded. Empty = same origin (Spring Boot serves it). */
const CONFIG = window.SHOPCART_CONFIG || {};

/* API host resolution, highest priority first:
   1. ?api=https://host      (try a backend without editing anything)
   2. localStorage "shopcart.apiBase"  (set by the "Connect backend" box)
   3. docs/config.js apiBase (the value baked into the deploy)
   4. same origin (Spring Boot is serving this page) */
const API_OVERRIDE =
  new URLSearchParams(location.search).get("api") ||
  localStorage.getItem("shopcart.apiBase") ||
  "";
/* An explicit choice (?api= or the connect box) must beat the value baked into config.js,
   otherwise the box would look like it does nothing. */
const API_BASE = String(API_OVERRIDE || CONFIG.apiBase || "").replace(/\/+$/, "");
/* True when this page is served by a static host (GitHub Pages) rather than by Spring Boot. */
const STATIC_HOST = CONFIG.staticHost === true;
const PAY_LABELS = { CARD: "Card", UPI: "UPI", NET_BANKING: "Net Banking", COD: "Cash on Delivery" };

const state = {
  token: localStorage.getItem("shopcart.token") || null,
  user: JSON.parse(localStorage.getItem("shopcart.user") || "null"),
  categories: [],
  category: "all",
  query: "",
  bill: null,
  couponCode: null,
  pendingAdd: null,
  adminTab: "reports",
  editingProduct: null,
};

const $ = (id) => document.getElementById(id);
const money = (value) =>
  "₹" + Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ------------------------------ API helper ------------------------------ */

async function api(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers.Authorization = "Bearer " + state.token;

  let response;
  try {
    response = await fetch(API_BASE + "/api" + path, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
    });
  } catch (networkError) {
    const codespaceHint = /\.app\.github\.dev\/?$/.test(API_BASE)
      ? " Note: a GitHub Codespaces URL cannot serve a separate site - GitHub puts a consent page in"
        + " front of the port and browsers block that for cross-origin requests. Open the codespace URL"
        + " directly instead (Spring Boot serves the storefront itself), or use a dedicated host."
      : "";
    throw new Error(
      API_BASE
        ? "Cannot reach the API at " + API_BASE + ". Is the backend running and is CORS configured for this origin?" + codespaceHint
        : "No API configured. Set apiBase in docs/config.js to your deployed ShopCart backend."
    );
  }

  const raw = await response.text();
  const isJson = (response.headers.get("content-type") || "").includes("json");
  let data = null;
  if (raw && isJson) {
    try { data = JSON.parse(raw); } catch (_) { data = null; }
  }

  if (!response.ok || !isJson) {
    let fallback;
    if (response.ok && !isJson) {
      // A 200 that is not JSON is almost always a captive/consent page in front of the API.
      fallback = "The backend replied with a web page instead of JSON. A GitHub Codespaces URL shows a "
        + "one-time 'Codespaces Access Port' consent page - open the URL in a tab, accept it, then reload. "
        + "A dedicated host (Render/Railway) does not do this.";
    } else if (response.status === 404) {
      fallback = "API endpoint not found. Check that apiBase points at the ShopCart backend.";
    } else {
      fallback = "Request failed (" + response.status + ").";
    }
    const error = new Error((data && data.message) || fallback);
    error.status = response.status;
    if (response.status === 401 && auth && state.token) {
      clearSession();
      toast("Your session ended. Please log in again.", "error");
    }
    throw error;
  }
  return data;
}

function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = message;
  $("toast-wrap").appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

/* ------------------------------ navigation ------------------------------ */

const VIEWS = ["shop", "cart", "checkout", "confirmation", "orders", "admin"];

function show(view) {
  VIEWS.forEach((name) => { $("view-" + name).hidden = name !== view; });
  document.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.nav === view);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "cart") loadCart();
  if (view === "checkout") loadCheckout();
  if (view === "orders") loadOrders();
  if (view === "admin") loadAdmin();
}

document.addEventListener("click", (event) => {
  const navBtn = event.target.closest("[data-nav]");
  if (navBtn) {
    event.preventDefault();
    const target = navBtn.dataset.nav;
    if (target === "cart" && !state.user) { openAuth("login"); return; }
    if (target === "orders" && !state.user) { openAuth("login"); return; }
    if (target === "admin" && !state.user) { openAuth("login"); return; }
    show(target);
    return;
  }
  const closeBtn = event.target.closest("[data-close]");
  if (closeBtn) { $(closeBtn.dataset.close).hidden = true; }
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.hidden = true;
  });
});

/* ------------------------------ auth ------------------------------ */

function openAuth(mode = "login") {
  $("auth-modal").hidden = false;
  setAuthTab(mode);
}

function setAuthTab(mode) {
  document.querySelectorAll("[data-auth]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.auth === mode);
  });
  $("login-form").hidden = mode !== "login";
  $("register-form").hidden = mode !== "register";
}

document.querySelectorAll("[data-auth]").forEach((tab) => {
  tab.addEventListener("click", () => setAuthTab(tab.dataset.auth));
});

$("auth-btn").addEventListener("click", () => openAuth("login"));

function applySession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem("shopcart.token", state.token);
  localStorage.setItem("shopcart.user", JSON.stringify(state.user));
  renderSession();
  $("auth-modal").hidden = true;
  refreshCartCount();
}

function clearSession() {
  state.token = null;
  state.user = null;
  state.bill = null;
  state.couponCode = null;
  localStorage.removeItem("shopcart.token");
  localStorage.removeItem("shopcart.user");
  renderSession();
  refreshCartCount();
}

function renderSession() {
  const loggedIn = !!state.user;
  $("auth-btn").hidden = loggedIn;
  $("account-chip").hidden = !loggedIn;
  $("nav-orders").hidden = !loggedIn;
  $("nav-admin").hidden = !loggedIn || state.user.role !== "ADMIN";
  if (loggedIn) {
    $("account-name").textContent = state.user.name.split(" ")[0];
    $("account-initial").textContent = state.user.name.charAt(0).toUpperCase();
  }
}

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api("/auth/login", {
      method: "POST",
      auth: false,
      body: { email: $("login-email").value, password: $("login-password").value },
    });
    applySession(payload);
    toast("Welcome back, " + payload.user.name.split(" ")[0] + "!", "success");
    if (state.pendingAdd) {
      const pending = state.pendingAdd;
      state.pendingAdd = null;
      await addToCart(pending.productId, pending.quantity);
    }
  } catch (error) {
    toast(error.message, "error");
  }
});

$("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/auth/register", {
      method: "POST",
      auth: false,
      body: {
        name: $("reg-name").value,
        email: $("reg-email").value,
        phone: $("reg-phone").value,
        password: $("reg-password").value,
        address: $("reg-address").value,
      },
    });
    toast(result.message, "success");
    $("login-email").value = $("reg-email").value;
    setAuthTab("login");
  } catch (error) {
    toast(error.message, "error");
  }
});

$("logout-btn").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST" }); } catch (_) { /* ignore */ }
  clearSession();
  show("shop");
  toast("Logged out");
});

/* ------------------------------ catalogue ------------------------------ */

async function loadCatalogue() {
  try {
    state.categories = await api("/catalog/categories", { auth: false });
    renderChips();
    await loadProducts();
  } catch (error) {
    toast(error.message, "error");
    if (STATIC_HOST) {
      showBackendBanner("<strong>Could not load the catalogue.</strong> " + esc(error.message) +
        " Point the storefront at a running backend below.");
    }
    $("product-count").textContent = "";
    $("shop-empty").hidden = true;
    $("product-grid").innerHTML = `
      <div class="panel empty" style="grid-column:1/-1">
        <h3>The catalogue could not be loaded</h3>
        <p class="muted">${esc(error.message)}</p>
        <p class="muted">The storefront on GitHub Pages needs a running ShopCart API.
        Point <code>apiBase</code> in <code>docs/config.js</code> at your backend (for example
        <code>https://shopcart-api.onrender.com</code>) and reload.</p>
      </div>`;
  }
}

function renderChips() {
  const chips = [{ slug: "all", name: "All products" }, ...state.categories];
  $("category-chips").innerHTML = chips
    .map(
      (category) =>
        `<button class="chip ${state.category === category.slug ? "active" : ""}" data-category="${esc(category.slug)}">${esc(category.name)}</button>`
    )
    .join("");
  $("category-chips").querySelectorAll("[data-category]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.category = chip.dataset.category;
      renderChips();
      loadProducts();
    });
  });
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (state.category !== "all") params.set("category", state.category);
  if (state.query) params.set("q", state.query);
  try {
    const products = await api("/catalog/products?" + params.toString(), { auth: false });
    renderProducts(products);
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderProducts(products) {
  $("product-count").textContent = products.length + " item" + (products.length === 1 ? "" : "s");
  $("shop-empty").hidden = products.length > 0;
  $("product-grid").innerHTML = products
    .map((product) => {
      const stockLabel =
        product.stock === 0
          ? '<span class="stock out">Out of stock</span>'
          : product.stock <= 5
          ? `<span class="stock low">Only ${product.stock} left</span>`
          : `<span class="stock">${product.stock} in stock</span>`;
      return `
        <article class="card" data-product="${product.id}">
          <div class="card-art">${esc(product.image || "📦")}</div>
          <div class="card-body">
            <span class="card-cat">${esc(product.category)}</span>
            <span class="card-name">${esc(product.name)}</span>
            <div class="card-foot">
              <span class="price">${money(product.price)}</span>
              ${stockLabel}
            </div>
          </div>
        </article>`;
    })
    .join("");

  $("product-grid").querySelectorAll("[data-product]").forEach((card) => {
    card.addEventListener("click", () => openProduct(Number(card.dataset.product)));
  });
}

let searchTimer = null;
$("search-input").addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadProducts, 260);
});

/* ------------------------------ product modal ------------------------------ */

async function openProduct(id) {
  try {
    const product = await api("/catalog/products/" + id, { auth: false });
    const out = product.stock === 0;
    $("product-detail").innerHTML = `
      <div class="pd-head">
        <div class="pd-art">${esc(product.image || "📦")}</div>
        <div>
          <span class="card-cat">${esc(product.category)}</span>
          <h2>${esc(product.name)}</h2>
          <div class="pd-price">${money(product.price)}</div>
        </div>
      </div>
      <p class="pd-desc">${esc(product.description || "No description available.")}</p>
      <p class="muted">${out ? "Currently out of stock." : product.stock + " unit(s) available."}</p>
      <div class="pd-actions">
        <div class="stepper">
          <button type="button" id="pd-minus">−</button>
          <span id="pd-qty">1</span>
          <button type="button" id="pd-plus">+</button>
        </div>
        <button class="btn btn-primary" id="pd-add" ${out ? "disabled" : ""}>
          ${out ? "Out of stock" : "Add to cart"}
        </button>
      </div>`;
    $("product-modal").hidden = false;

    let qty = 1;
    $("pd-minus").addEventListener("click", () => {
      qty = Math.max(1, qty - 1);
      $("pd-qty").textContent = qty;
    });
    $("pd-plus").addEventListener("click", () => {
      qty = Math.min(product.stock || 1, qty + 1);
      $("pd-qty").textContent = qty;
    });
    $("pd-add").addEventListener("click", async () => {
      $("product-modal").hidden = true;
      await addToCart(product.id, qty);
    });
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ------------------------------ cart ------------------------------ */

async function addToCart(productId, quantity) {
  if (!state.user) {
    state.pendingAdd = { productId, quantity };
    openAuth("login");
    return;
  }
  try {
    const result = await api("/cart/items", { method: "POST", body: { productId, quantity } });
    toast(result.message, "success");
    await refreshCartCount();
    if (!$("view-cart").hidden) loadCart();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function refreshCartCount() {
  if (!state.user) { $("cart-count").textContent = "0"; return; }
  try {
    const bill = await api("/cart");
    $("cart-count").textContent = bill.itemCount;
  } catch (_) {
    $("cart-count").textContent = "0";
  }
}

async function loadCart() {
  try {
    const bill = state.couponCode
      ? await api("/cart/quote", { method: "POST", body: { couponCode: state.couponCode } })
      : await api("/cart");
    state.bill = bill;
    renderCart(bill);
  } catch (error) {
    if (error.status === 400 && state.couponCode) {
      state.couponCode = null;
      return loadCart();
    }
    toast(error.message, "error");
  }
}

function renderCart(bill) {
  $("cart-count").textContent = bill.itemCount;

  if (!bill.lines.length) {
    $("cart-lines").innerHTML = `<div class="panel empty">Your cart is empty. <button class="link" data-nav="shop">Start shopping</button></div>`;
    $("bill-panel").innerHTML = "";
    return;
  }

  $("cart-lines").innerHTML = bill.lines
    .map(
      (line) => `
      <div class="line">
        <div class="line-art">${esc(line.image || "📦")}</div>
        <div>
          <div class="line-name">${esc(line.name)}</div>
          <div class="muted">${money(line.price)} each · ${line.stock} in stock</div>
        </div>
        <div class="stepper">
          <button data-dec="${line.productId}">−</button>
          <span>${line.quantity}</span>
          <button data-inc="${line.productId}" data-max="${line.stock}">+</button>
        </div>
        <div style="text-align:right">
          <div class="price">${money(line.subtotal)}</div>
          <button class="link" data-remove="${line.productId}">Remove</button>
        </div>
      </div>`
    )
    .join("");

  $("cart-lines").querySelectorAll("[data-inc]").forEach((btn) => {
    btn.addEventListener("click", () => updateQuantity(Number(btn.dataset.inc), Number(btn.dataset.max)));
  });
  $("cart-lines").querySelectorAll("[data-dec]").forEach((btn) => {
    btn.addEventListener("click", () => updateQuantity(Number(btn.dataset.dec), null));
  });
  $("cart-lines").querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeItem(Number(btn.dataset.remove)));
  });

  renderBill(bill, $("bill-panel"), { couponInput: true, checkoutButton: true });
}

function renderBill(bill, target, options = {}) {
  const lines = bill.lines || [];
  const shippingRow =
    Number(bill.shipping) === 0
      ? `<div class="bill-row"><span>Shipping</span><span class="free">FREE</span></div>`
      : `<div class="bill-row"><span>Shipping</span><span>${money(bill.shipping)}</span></div>`;
  const discountRow =
    Number(bill.discount) > 0
      ? `<div class="bill-row"><span>Discount ${bill.couponCode ? "(" + esc(bill.couponCode) + ")" : ""}</span><span class="save">− ${money(bill.discount)}</span></div>`
      : "";
  const freeShipNote =
    Number(bill.freeShippingGap) > 0
      ? `<div class="notice">Add ${money(bill.freeShippingGap)} more for free delivery.</div>`
      : `<div class="notice good">Free delivery unlocked.</div>`;

  target.innerHTML = `
    <h3>Bill details</h3>
    ${lines.length ? freeShipNote : ""}
    <div class="bill-row"><span>Subtotal (${bill.itemCount} item${bill.itemCount === 1 ? "" : "s"})</span><span>${money(bill.subtotal)}</span></div>
    <div class="bill-row"><span>GST (${(Number(bill.taxRate) * 100).toFixed(0)}%)</span><span>${money(bill.tax)}</span></div>
    ${shippingRow}
    ${discountRow}
    <div class="bill-row total"><span>Grand total</span><span>${money(bill.grandTotal)}</span></div>
    ${
      options.couponInput
        ? `<div class="coupon-row">
             <input id="coupon-input" placeholder="Coupon code" value="${esc(bill.couponCode || "")}" />
             <button class="btn btn-ghost btn-sm" id="coupon-apply">Apply</button>
           </div>
           <p class="hint">Try WELCOME10 or FLAT100.</p>`
        : ""
    }
    ${
      options.checkoutButton
        ? `<button class="btn btn-primary btn-block" id="go-checkout" style="margin-top:14px">Proceed to checkout</button>`
        : ""
    }`;

  if (options.couponInput) {
    $("coupon-apply").addEventListener("click", applyCoupon);
    $("coupon-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); applyCoupon(); }
    });
  }
  if (options.checkoutButton) {
    $("go-checkout").addEventListener("click", () => {
      if (!state.user) { openAuth("login"); return; }
      show("checkout");
    });
  }
}

async function applyCoupon() {
  const code = $("coupon-input").value.trim();
  if (!code) {
    state.couponCode = null;
    return loadCart();
  }
  try {
    const bill = await api("/cart/quote", { method: "POST", body: { couponCode: code } });
    state.couponCode = bill.couponCode;
    state.bill = bill;
    renderCart(bill);
    toast(bill.couponMessage || "Coupon applied", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function updateQuantity(productId, max) {
  const line = (state.bill?.lines || []).find((item) => item.productId === productId);
  if (!line) return;
  let next = line.quantity;
  if (max === null) next -= 1;
  else {
    if (line.quantity >= max) { toast("Only " + max + " in stock", "error"); return; }
    next += 1;
  }
  try {
    await api("/cart/items/" + productId, { method: "PATCH", body: { quantity: next } });
    loadCart();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function removeItem(productId) {
  try {
    await api("/cart/items/" + productId, { method: "DELETE" });
    toast("Item removed");
    loadCart();
  } catch (error) {
    toast(error.message, "error");
  }
}

$("continue-shopping").addEventListener("click", () => show("shop"));

/* ------------------------------ checkout ------------------------------ */

async function loadCheckout() {
  try {
    const bill = state.couponCode
      ? await api("/cart/quote", { method: "POST", body: { couponCode: state.couponCode } })
      : await api("/cart");
    state.bill = bill;
    if (!bill.lines.length) {
      toast("Your cart is empty", "error");
      return show("shop");
    }
    $("checkout-address").value = state.user?.address || "";
    renderBill(bill, $("checkout-bill"), {});
    updatePayDetail();
  } catch (error) {
    toast(error.message, "error");
  }
}

function currentPayMethod() {
  return document.querySelector('input[name="pay"]:checked').value;
}

function updatePayDetail() {
  const method = currentPayMethod();
  const field = $("pay-detail-field");
  const label = $("pay-detail-label");
  const input = $("pay-detail");
  if (method === "COD") {
    field.hidden = true;
    input.value = "";
    return;
  }
  field.hidden = false;
  if (method === "CARD") {
    label.textContent = "Card number";
    input.placeholder = "4111 1111 1111 1111";
  } else if (method === "UPI") {
    label.textContent = "UPI ID";
    input.placeholder = "yourname@okhdfcbank";
  } else {
    label.textContent = "Bank";
    input.placeholder = "HDFC Bank";
  }
}

document.querySelectorAll('input[name="pay"]').forEach((radio) => {
  radio.addEventListener("change", updatePayDetail);
});

$("checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("place-order-btn");
  button.disabled = true;
  button.textContent = "Processing payment...";
  try {
    const order = await api("/checkout", {
      method: "POST",
      body: {
        shippingAddress: $("checkout-address").value.trim(),
        paymentMethod: currentPayMethod(),
        paymentDetail: $("pay-detail").value.trim(),
        couponCode: state.couponCode,
      },
    });
    state.couponCode = null;
    await refreshCartCount();
    renderConfirmation(order);
    show("confirmation");
  } catch (error) {
    // Algorithm A step 21 - stay on the payment step so the user can retry.
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Pay & place order";
  }
});

function renderConfirmation(order) {
  const steps = timelineHtml(order);
  $("confirmation-panel").innerHTML = `
    <div class="tick">✅</div>
    <h2>Order placed successfully</h2>
    <p class="muted">${esc(order.paymentMethod === "COD" ? "Pay on delivery" : "Payment received")} · confirmation sent to ${esc(order.customerEmail)}</p>
    <div class="order-code">${esc(order.orderCode)}</div>
    <div class="bill-row"><span>Items</span><span>${order.items.reduce((sum, item) => sum + item.quantity, 0)}</span></div>
    <div class="bill-row total"><span>Amount</span><span>${money(order.grandTotal)}</span></div>
    <p class="muted" style="margin-top:10px">Delivering to: ${esc(order.shippingAddress)}</p>
    ${steps}
    <div class="confirm-actions">
      <button class="btn btn-primary" data-nav="orders">Track order</button>
      <button class="btn btn-ghost" data-nav="shop">Shop again</button>
    </div>`;
}

/* ------------------------------ orders ------------------------------ */

async function loadOrders() {
  try {
    const orders = await api("/orders");
    if (!orders.length) {
      $("orders-list").innerHTML = `<div class="panel empty">You have not placed any orders yet.</div>`;
      return;
    }
    $("orders-list").innerHTML = orders
      .map(
        (order) => `
        <article class="order-card">
          <div class="order-top">
            <div>
              <strong>${esc(order.orderCode)}</strong>
              <div class="order-meta">
                <span>${esc(order.createdAt)}</span>
                <span>${esc(PAY_LABELS[order.paymentMethod] || order.paymentMethod)} · ${esc(order.paymentStatus)}</span>
                <span>${order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</span>
              </div>
            </div>
            <span class="status ${esc(order.status)}">${esc(order.statusLabel)}</span>
          </div>
          ${timelineHtml(order)}
          <div class="order-items">
            ${order.items
              .map(
                (item) => `<div class="order-item"><span>${esc(item.image || "📦")} ${esc(item.name)} × ${item.quantity}</span><span>${money(item.lineTotal)}</span></div>`
              )
              .join("")}
          </div>
          <div class="order-foot">
            <span class="price">${money(order.grandTotal)}</span>
            ${order.cancellable ? `<button class="btn btn-danger btn-sm" data-cancel="${esc(order.orderCode)}">Cancel order</button>` : ""}
          </div>
        </article>`
      )
      .join("");

    $("orders-list").querySelectorAll("[data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => cancelOrder(btn.dataset.cancel));
    });
  } catch (error) {
    toast(error.message, "error");
  }
}

function timelineHtml(order) {
  if (order.status === "CANCELLED") {
    return `<div class="timeline"><span class="step current" style="background:#dc2626">Cancelled</span></div>`;
  }
  const currentIndex = STATUS_FLOW.indexOf(order.status);
  return `<div class="timeline">${STATUS_FLOW.map((status, index) => {
    const cls = index < currentIndex ? "done" : index === currentIndex ? "current" : "";
    return `<span class="step ${cls}">${status.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>`;
  }).join("")}</div>`;
}

async function cancelOrder(orderCode) {
  if (!confirm("Cancel order " + orderCode + "? The stock will be returned to the catalogue.")) return;
  try {
    await api("/orders/" + orderCode + "/cancel", { method: "POST" });
    toast("Order cancelled and stock restored", "success");
    loadOrders();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ------------------------------ admin ------------------------------ */

document.querySelectorAll("#admin-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.adminTab = tab.dataset.tab;
    document.querySelectorAll("#admin-tabs .tab").forEach((t) => t.classList.toggle("active", t === tab));
    ["reports", "products", "orders"].forEach((name) => { $("tab-" + name).hidden = name !== state.adminTab; });
    if (state.adminTab === "products") loadAdminProducts();
    if (state.adminTab === "orders") loadAdminOrders();
    if (state.adminTab === "reports") loadReports();
  });
});

async function loadAdmin() {
  if (!state.user || state.user.role !== "ADMIN") { toast("Admin access only", "error"); return show("shop"); }
  await loadReports();
  if (state.adminTab === "products") await loadAdminProducts();
  if (state.adminTab === "orders") await loadAdminOrders();
}

async function loadReports() {
  try {
    const report = await api("/admin/reports");
    const stats = [
      ["Revenue", money(report.revenue)],
      ["Orders", report.totalOrders],
      ["Delivered", report.delivered],
      ["In progress", report.placed + report.processing + report.shipped + report.outForDelivery],
      ["Cancelled", report.cancelled],
      ["Products", report.products],
      ["Low stock", report.lowStock],
      ["Customers", report.customers],
    ];
    $("stat-grid").innerHTML = stats
      .map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`)
      .join("");

    $("low-stock").innerHTML = report.lowStockProducts.length
      ? `<table><thead><tr><th>Product</th><th>Stock</th></tr></thead><tbody>${report.lowStockProducts
          .map((product) => `<tr><td>${esc(product.image || "📦")} ${esc(product.name)}</td><td>${product.stock}</td></tr>`)
          .join("")}</tbody></table>`
      : `<p class="muted">Every product is comfortably in stock.</p>`;

    $("recent-orders").innerHTML = report.recentOrders.length
      ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead><tbody>${report.recentOrders
          .map(
            (order) =>
              `<tr><td>${esc(order.orderCode)}</td><td>${esc(order.customerName)}</td><td><span class="status ${esc(order.status)}">${esc(order.statusLabel)}</span></td><td>${money(order.grandTotal)}</td></tr>`
          )
          .join("")}</tbody></table>`
      : `<p class="muted">No orders yet.</p>`;
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadAdminProducts() {
  try {
    const [products, categories] = await Promise.all([api("/admin/products"), api("/admin/categories")]);
    state.categories = categories;
    $("p-category").innerHTML = categories
      .map((category) => `<option value="${category.id}">${esc(category.name)}</option>`)
      .join("");

    $("admin-products").innerHTML = `
      <table>
        <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${products
          .map(
            (product) => `
            <tr>
              <td>${esc(product.image || "📦")} ${esc(product.name)}</td>
              <td>${esc(product.category)}</td>
              <td>${money(product.price)}</td>
              <td>${product.stock}</td>
              <td>${product.active ? "Live" : "Hidden"}</td>
              <td class="row-actions">
                <button class="btn btn-ghost btn-sm" data-edit="${product.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-delete="${product.id}">Delete</button>
              </td>
            </tr>`
          )
          .join("")}
        </tbody>
      </table>`;

    $("admin-products").querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => fillProductForm(products.find((p) => p.id === Number(btn.dataset.edit))));
    });
    $("admin-products").querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => deleteProduct(Number(btn.dataset.delete)));
    });
  } catch (error) {
    toast(error.message, "error");
  }
}

function fillProductForm(product) {
  state.editingProduct = product.id;
  $("product-form-title").textContent = "Update product";
  $("p-id").value = product.id;
  $("p-name").value = product.name;
  $("p-price").value = product.price;
  $("p-stock").value = product.stock;
  $("p-image").value = product.image || "";
  $("p-description").value = product.description || "";
  const category = state.categories.find((c) => c.name === product.category);
  if (category) $("p-category").value = category.id;
  $("product-form").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetProductForm() {
  state.editingProduct = null;
  $("product-form-title").textContent = "Add product";
  $("product-form").reset();
  $("p-id").value = "";
}

$("product-form-reset").addEventListener("click", resetProductForm);

$("product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: $("p-name").value,
    price: Number($("p-price").value),
    stock: Number($("p-stock").value),
    categoryId: Number($("p-category").value) || null,
    image: $("p-image").value || "📦",
    description: $("p-description").value,
    active: true,
  };
  try {
    if (state.editingProduct) {
      await api("/admin/products/" + state.editingProduct, { method: "PUT", body: payload });
      toast("Product updated", "success");
    } else {
      await api("/admin/products", { method: "POST", body: payload });
      toast("Product added", "success");
    }
    resetProductForm();
    loadAdminProducts();
  } catch (error) {
    toast(error.message, "error");
  }
});

async function deleteProduct(id) {
  if (!confirm("Remove this product from the catalogue?")) return;
  try {
    const result = await api("/admin/products/" + id, { method: "DELETE" });
    toast(result.message, "success");
    loadAdminProducts();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadAdminOrders() {
  try {
    const orders = await api("/admin/orders");
    if (!orders.length) {
      $("admin-orders").innerHTML = `<p class="muted">No orders yet.</p>`;
      return;
    }
    $("admin-orders").innerHTML = `
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Status</th><th>Move to</th></tr></thead>
        <tbody>
        ${orders
          .map(
            (order) => `
            <tr>
              <td>${esc(order.orderCode)}</td>
              <td>${esc(order.customerName)}<div class="muted">${esc(order.customerEmail)}</div></td>
              <td>${esc(order.createdAt)}</td>
              <td>${money(order.grandTotal)}</td>
              <td><span class="status ${esc(order.status)}">${esc(order.statusLabel)}</span></td>
              <td>
                <select class="mini" data-order="${esc(order.orderCode)}">
                  <option value="">Change status…</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="SHIPPED">Shipped</option>
                  <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </td>
            </tr>`
          )
          .join("")}
        </tbody>
      </table>`;

    $("admin-orders").querySelectorAll("[data-order]").forEach((select) => {
      select.addEventListener("change", async () => {
        const status = select.value;
        if (!status) return;
        try {
          await api("/admin/orders/" + select.dataset.order + "/status", { method: "PATCH", body: { status } });
          toast("Order moved to " + status.replaceAll("_", " ").toLowerCase(), "success");
          loadAdminOrders();
        } catch (error) {
          toast(error.message, "error");
          select.value = "";
        }
      });
    });
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ------------------------------ boot ------------------------------ */

function connectBoxHtml() {
  const saved = localStorage.getItem("shopcart.apiBase");
  return `<div class="banner-form">
      <input id="api-url" type="url" placeholder="https://your-backend.onrender.com"
             value="${esc(API_BASE)}" />
      <button class="btn btn-primary btn-sm" id="api-connect">Connect</button>
      ${saved ? '<button class="btn btn-ghost btn-sm" id="api-reset">Use deployed default</button>' : ""}
    </div>`;
}

function wireConnectBox() {
  const input = $("api-url");
  if (!input) return;
  const connect = () => {
    const value = input.value.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(value)) {
      toast("Enter a full URL starting with https://", "error");
      return;
    }
    localStorage.setItem("shopcart.apiBase", value);
    location.reload();
  };
  $("api-connect").addEventListener("click", connect);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); connect(); }
  });
  const reset = $("api-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      localStorage.removeItem("shopcart.apiBase");
      location.reload();
    });
  }
}

function showBackendBanner(message) {
  const banner = $("backend-banner");
  banner.innerHTML = "<div>" + message + "</div>" + connectBoxHtml();
  banner.hidden = false;
  wireConnectBox();
}

(async function boot() {
  renderSession();

  if (STATIC_HOST) {
    const settings = $("api-settings");
    settings.hidden = false;
    settings.addEventListener("click", () => {
      showBackendBanner("<strong>Backend URL.</strong> Currently using " +
        (API_BASE ? "<code>" + esc(API_BASE) + "</code>" : "same origin (nothing configured)") + ".");
    });
  }

  if (STATIC_HOST && !API_BASE) {
    showBackendBanner(
      "<strong>Backend not connected.</strong> This storefront is hosted on GitHub Pages and needs the " +
      "ShopCart API. Set <code>apiBase</code> in <code>docs/config.js</code> to your deployed backend URL."
    );
    $("category-chips").innerHTML = "";
    $("product-count").textContent = "";
    $("product-grid").innerHTML = `
      <div class="panel empty" style="grid-column:1/-1">
        <h3>The storefront is live, the API is not connected yet</h3>
        <p class="muted">GitHub Pages serves static files only, so the Spring Boot backend runs elsewhere.</p>
        <p class="muted">Paste your backend URL in the box above (or add <code>?api=https://your-backend</code>
        to this page's address) and the shop loads. To make it permanent for everyone, set
        <code>apiBase</code> in <code>docs/config.js</code>.</p>
      </div>`;
    return;
  }

  await loadCatalogue();
  if (state.user) await refreshCartCount();
  show("shop");
})();
