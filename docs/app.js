/* ShopCart storefront. Talks to the Spring Boot API; API host comes from config.js. */

const CONFIG = window.SHOPCART_CONFIG || {};
const API_OVERRIDE =
  new URLSearchParams(location.search).get("api") ||
  localStorage.getItem("shopcart.apiBase") ||
  "";
/* An explicit choice (?api= or the connect box) must beat the value baked into config.js. */
const API_BASE = String(API_OVERRIDE || CONFIG.apiBase || "").replace(/\/+$/, "");
const STATIC_HOST = CONFIG.staticHost === true;

const STATUS_FLOW = ["PLACED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
const PAY_LABELS = { CARD: "Card", UPI: "UPI", NET_BANKING: "Net banking", COD: "Cash on delivery" };

const state = {
  token: localStorage.getItem("shopcart.token") || null,
  user: JSON.parse(localStorage.getItem("shopcart.user") || "null"),
  categories: [],
  products: [],
  category: "all",
  query: "",
  sort: "featured",
  bill: null,
  couponCode: null,
  pending: null,
  adminTab: "overview",
  editingProduct: null,
};

const $ = (id) => document.getElementById(id);
const money = (value) => {
  const n = Number(value || 0);
  const hasPaise = Math.round(Math.abs(n) * 100) % 100 !== 0;
  return "₹" + n.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
};
const discountPct = (price, mrp) =>
  mrp && Number(mrp) > Number(price) ? Math.round((1 - Number(price) / Number(mrp)) * 100) : 0;
const esc = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ API ------------------------------ */

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
      ? " A GitHub Codespaces URL cannot serve a separate site - GitHub puts a consent page in front of"
        + " the port and browsers block that cross-origin. Open the codespace URL directly instead."
      : "";
    throw new Error(
      API_BASE
        ? "Cannot reach the API at " + API_BASE + ". Is the backend awake and is CORS configured for this origin?" + codespaceHint
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
      fallback = "The backend replied with a web page instead of JSON - a consent or captive portal is in front of it.";
    } else if (response.status === 404) {
      fallback = "API endpoint not found. Check that apiBase points at the ShopCart backend.";
    } else {
      fallback = "Request failed (" + response.status + ").";
    }
    const error = new Error((data && data.message) || fallback);
    error.status = response.status;
    if (response.status === 401 && auth && state.token) {
      clearSession();
      toast("Your session ended. Please sign in again.", "error");
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
  setTimeout(() => el.remove(), 3800);
}

/* ------------------------------ navigation ------------------------------ */

const VIEWS = ["shop", "cart", "checkout", "confirmation", "orders", "account", "admin"];

function show(view) {
  VIEWS.forEach((name) => { $("view-" + name).hidden = name !== view; });
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "cart") loadCart();
  if (view === "checkout") loadCheckout();
  if (view === "orders") loadOrders();
  if (view === "account") loadAccount();
  if (view === "admin") loadAdmin();
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    event.preventDefault();
    const target = nav.dataset.nav;
    if ((target === "cart" || target === "orders" || target === "account") && !state.user) {
      openAuth("login");
      return;
    }
    show(target);
    return;
  }
  if (event.target.closest("[data-scroll-grid]")) {
    $("product-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const close = event.target.closest("[data-close]");
  if (close) $(close.dataset.close).hidden = true;
});

document.querySelectorAll(".sheet-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.hidden = true;
  });
});

/* ------------------------------ session ------------------------------ */

function renderSession() {
  const signedIn = !!state.user;
  $("account-label").textContent = signedIn ? state.user.name.split(" ")[0] : "Sign in";
  $("hero-orders").hidden = !signedIn;
  if (signedIn) $("cart-count").textContent = $("cart-count").textContent || "0";
}

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
  $("cart-count").textContent = "0";
  renderSession();
}

$("account-btn").addEventListener("click", () => {
  if (state.user) show("account");
  else openAuth("login");
});

/* ------------------------------ auth ------------------------------ */

function openAuth(mode = "login") {
  $("auth-modal").hidden = false;
  setAuthTab(mode);
}

function setAuthTab(mode) {
  document.querySelectorAll("[data-auth]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.auth === mode);
  });
  $("login-form").hidden = mode !== "login";
  $("register-form").hidden = mode !== "register";
}

document.querySelectorAll("[data-auth]").forEach((tab) => {
  tab.addEventListener("click", () => setAuthTab(tab.dataset.auth));
});

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api("/auth/login", {
      method: "POST",
      auth: false,
      body: { email: $("login-email").value, password: $("login-password").value },
    });
    applySession(payload);
    toast("Signed in as " + payload.user.name.split(" ")[0], "success");
    if (state.pending) {
      const pending = state.pending;
      state.pending = null;
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
    $("register-form").reset();
    setAuthTab("login");
  } catch (error) {
    toast(error.message, "error");
  }
});

$("account-signout").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST" }); } catch (_) { /* token may be gone */ }
  clearSession();
  show("shop");
  toast("Signed out");
});

/* ------------------------------ catalogue ------------------------------ */

function showBackendBanner(message) {
  const banner = $("backend-banner");
  const saved = localStorage.getItem("shopcart.apiBase");
  banner.innerHTML =
    "<div>" + message + "</div>" +
    `<div class="banner-form">
       <input id="api-url" type="url" placeholder="https://your-backend.onrender.com" value="${esc(API_BASE)}" />
       <button class="btn btn-solid btn-sm" id="api-connect">Connect</button>
       ${saved ? '<button class="btn btn-quiet btn-sm" id="api-reset">Use deployed default</button>' : ""}
     </div>`;
  banner.hidden = false;

  const input = $("api-url");
  const connect = () => {
    const value = input.value.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(value)) { toast("Enter a full URL starting with https://", "error"); return; }
    localStorage.setItem("shopcart.apiBase", value);
    location.reload();
  };
  $("api-connect").addEventListener("click", connect);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); connect(); } });
  const reset = $("api-reset");
  if (reset) reset.addEventListener("click", () => { localStorage.removeItem("shopcart.apiBase"); location.reload(); });
}

async function loadCatalogue(attempt = 1) {
  try {
    state.categories = await api("/catalog/categories", { auth: false });
    renderCategoryBar();
    await loadProducts();
    if (STATIC_HOST) $("backend-banner").hidden = true;
  } catch (error) {
    const retryable = !error.status || error.status >= 500;
    if (retryable && attempt <= 3 && STATIC_HOST) {
      showBackendBanner(
        "<strong>Waking the backend…</strong> free hosts sleep when idle, so the first request can take up to a minute. Retrying (" + attempt + "/3)."
      );
      await sleep(4000 * attempt);
      return loadCatalogue(attempt + 1);
    }
    toast(error.message, "error");
    if (STATIC_HOST) showBackendBanner("<strong>The catalogue could not be loaded.</strong> " + esc(error.message));
    $("product-grid").innerHTML = "";
    $("product-count").textContent = "";
  }
}

function renderCategoryBar() {
  const items = [{ slug: "all", name: "All" }, ...state.categories];
  $("category-bar").innerHTML = items
    .map(
      (c) =>
        `<button class="nav-item ${state.category === c.slug ? "is-active" : ""}" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`
    )
    .join("");
  $("category-bar").querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.category = btn.dataset.cat;
      renderCategoryBar();
      $("catalogue-title").textContent =
        btn.dataset.cat === "all" ? "Shop all" : state.categories.find((c) => c.slug === btn.dataset.cat).name;
      loadProducts();
    });
  });
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (state.category !== "all") params.set("category", state.category);
  if (state.query) params.set("q", state.query);
  try {
    state.products = await api("/catalog/products?" + params.toString(), { auth: false });
    renderProducts();
  } catch (error) {
    toast(error.message, "error");
  }
}

function sortedProducts() {
  const list = [...state.products];
  const by = state.sort;
  if (by === "price-asc") list.sort((a, b) => a.price - b.price);
  if (by === "price-desc") list.sort((a, b) => b.price - a.price);
  if (by === "rating") list.sort((a, b) => b.rating - a.rating);
  if (by === "discount") list.sort((a, b) => discountPct(b.price, b.mrp) - discountPct(a.price, a.mrp));
  return list;
}

function productTag(p) {
  const off = discountPct(p.price, p.mrp);
  if (p.stock === 0) return '<span class="tag low">Sold out</span>';
  if (off >= 20) return `<span class="tag sale">${off}% off</span>`;
  if (p.reviewCount > 1000 && p.rating >= 4.5) return '<span class="tag">Bestseller</span>';
  if (p.stock <= 5) return '<span class="tag low">Low stock</span>';
  return "";
}

function renderProducts() {
  const list = sortedProducts();
  $("product-count").textContent = list.length + (list.length === 1 ? " product" : " products");
  $("shop-empty").hidden = list.length > 0;

  $("product-grid").innerHTML = list
    .map((p) => {
      const off = discountPct(p.price, p.mrp);
      const out = p.stock === 0;
      return `
      <article class="card-product">
        <div class="card-art" data-open="${p.id}">
          ${productTag(p)}
          <button class="quick-add" data-add="${p.id}" ${out ? "disabled" : ""}>
            ${out ? "Sold out" : "Add to bag"}
          </button>
          ${productArt(p.image)}
        </div>
        <div class="card-body">
          <span class="card-brand">${esc(p.brand || "ShopCart")}</span>
          <span class="card-name" data-open="${p.id}">${esc(p.name)}</span>
          <div class="rating">${starsSvg(p.rating)}<span>${Number(p.rating || 0).toFixed(1)} · ${p.reviewCount || 0} reviews</span></div>
          <div class="price-row">
            <span class="price">${money(p.price)}</span>
            ${off > 0 ? `<span class="mrp">${money(p.mrp)}</span><span class="off">${off}% off</span>` : ""}
          </div>
          ${p.stock > 0 && p.stock <= 5 ? `<span class="stock-note">Only ${p.stock} left</span>` : ""}
        </div>
      </article>`;
    })
    .join("");

  $("product-grid").querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (event) => {
      if (event.target.closest("[data-add]")) return;
      openProduct(Number(el.dataset.open));
    });
  });
  $("product-grid").querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      addToCart(Number(btn.dataset.add), 1);
    });
  });
}

let searchTimer = null;
$("search-input").addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadProducts, 260);
});

$("sort-select").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderProducts();
});

$("clear-filters").addEventListener("click", () => {
  state.category = "all";
  state.query = "";
  $("search-input").value = "";
  $("catalogue-title").textContent = "Shop all";
  renderCategoryBar();
  loadProducts();
});

/* ------------------------------ product sheet ------------------------------ */

async function openProduct(id) {
  try {
    const p = await api("/catalog/products/" + id, { auth: false });
    const off = discountPct(p.price, p.mrp);
    const out = p.stock === 0;
    $("product-detail").innerHTML = `
      <div class="pd">
        <div class="pd-art">${productArt(p.image)}</div>
        <div>
          <p class="pd-brand">${esc(p.brand || "ShopCart")} · ${esc(p.category)}</p>
          <h2>${esc(p.name)}</h2>
          <div class="rating">${starsSvg(p.rating)}<span>${Number(p.rating || 0).toFixed(1)} · ${p.reviewCount || 0} reviews</span></div>
          <div class="pd-price">
            <span class="price">${money(p.price)}</span>
            ${off > 0 ? `<span class="mrp">${money(p.mrp)}</span><span class="off">${off}% off</span>` : ""}
          </div>
          <p class="muted">Inclusive of all taxes</p>
          <p class="pd-desc">${esc(p.description)}</p>
          <ul class="pd-facts">
            <li><svg viewBox="0 0 20 20"><path d="M2 6h9v8H2zM11 8h4l3 3v3h-7z"/><circle cx="6" cy="15" r="1.6"/><circle cx="15" cy="15" r="1.6"/></svg>
              ${out ? "Currently unavailable" : "In stock — dispatched within 24 hours"}</li>
            <li><svg viewBox="0 0 20 20"><path d="M10 2.5 3.5 5.5v5c0 3.4 2.7 6 6.5 7 3.8-1 6.5-3.6 6.5-7v-5z"/></svg>
              Two-year warranty · 30-day returns</li>
            <li><svg viewBox="0 0 20 20"><path d="M3 10.5 8 15l9-9"/></svg>
              Free delivery over ₹999</li>
          </ul>
          <div class="pd-actions">
            <div class="qty">
              <button type="button" id="pd-minus" aria-label="Decrease">−</button>
              <span id="pd-qty">1</span>
              <button type="button" id="pd-plus" aria-label="Increase">+</button>
            </div>
            <button class="btn btn-solid" id="pd-add" ${out ? "disabled" : ""}>${out ? "Sold out" : "Add to bag"}</button>
          </div>
        </div>
      </div>`;
    $("product-modal").hidden = false;

    let qty = 1;
    $("pd-minus").addEventListener("click", () => { qty = Math.max(1, qty - 1); $("pd-qty").textContent = qty; });
    $("pd-plus").addEventListener("click", () => {
      qty = Math.min(p.stock || 1, qty + 1);
      $("pd-qty").textContent = qty;
    });
    $("pd-add").addEventListener("click", async () => {
      $("product-modal").hidden = true;
      await addToCart(p.id, qty);
    });
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ------------------------------ cart ------------------------------ */

async function addToCart(productId, quantity) {
  if (!state.user) {
    state.pending = { productId, quantity };
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
    $("cart-lines").innerHTML = `
      <div class="card" style="text-align:center;padding:56px 24px">
        <h2>Your bag is empty</h2>
        <p class="muted" style="margin:8px 0 20px">Nothing added yet.</p>
        <button class="btn btn-solid" data-nav="shop">Browse the collection</button>
      </div>`;
    $("bill-panel").innerHTML = "";
    return;
  }

  $("cart-lines").innerHTML = bill.lines
    .map(
      (line) => `
      <div class="line">
        <div class="line-art">${productArt(line.image)}</div>
        <div class="line-main">
          <span class="line-brand">${esc(line.brand || "")}</span>
          <span class="line-name">${esc(line.name)}</span>
          <span class="line-meta">${money(line.price)} each · ${line.stock} in stock</span>
          <div class="line-controls">
            <div class="qty">
              <button data-dec="${line.productId}" aria-label="Decrease">−</button>
              <span>${line.quantity}</span>
              <button data-inc="${line.productId}" data-max="${line.stock}" aria-label="Increase">+</button>
            </div>
            <button class="line-remove" data-remove="${line.productId}">Remove</button>
          </div>
        </div>
        <div class="line-total">${money(line.subtotal)}</div>
      </div>`
    )
    .join("");

  $("cart-lines").querySelectorAll("[data-inc]").forEach((b) =>
    b.addEventListener("click", () => updateQuantity(Number(b.dataset.inc), Number(b.dataset.max)))
  );
  $("cart-lines").querySelectorAll("[data-dec]").forEach((b) =>
    b.addEventListener("click", () => updateQuantity(Number(b.dataset.dec), null))
  );
  $("cart-lines").querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => removeItem(Number(b.dataset.remove)))
  );

  renderSummary(bill, $("bill-panel"), { coupon: true, checkout: true });
}

function renderSummary(bill, target, options = {}) {
  const free = Number(bill.shipping) === 0;
  target.innerHTML = `
    <h2>Order summary</h2>
    ${Number(bill.freeShippingGap) > 0
      ? `<div class="ship-note">Add ${money(bill.freeShippingGap)} more for free delivery</div>`
      : `<div class="ship-note">Free delivery applied</div>`}
    <div class="sum-row"><span>Subtotal (${bill.itemCount} item${bill.itemCount === 1 ? "" : "s"})</span><span>${money(bill.subtotal)}</span></div>
    <div class="sum-row"><span>GST (${(Number(bill.taxRate) * 100).toFixed(0)}%)</span><span>${money(bill.tax)}</span></div>
    <div class="sum-row"><span>Delivery</span>${free ? '<span class="free">Free</span>' : `<span>${money(bill.shipping)}</span>`}</div>
    ${Number(bill.discount) > 0
      ? `<div class="sum-row"><span>Discount${bill.couponCode ? " (" + esc(bill.couponCode) + ")" : ""}</span><span class="save">− ${money(bill.discount)}</span></div>`
      : ""}
    <div class="sum-row total"><span>Total</span><span>${money(bill.grandTotal)}</span></div>
    ${options.coupon
      ? `<div class="coupon">
           <input id="coupon-input" placeholder="Coupon code" value="${esc(bill.couponCode || "")}" />
           <button class="btn btn-quiet btn-sm" id="coupon-apply">Apply</button>
         </div>
         <p class="hint">Try WELCOME10 or FLAT100.</p>`
      : ""}
    ${options.checkout ? '<button class="btn btn-solid btn-block" id="go-checkout">Proceed to checkout</button>' : ""}
    <p class="sum-note">
      <svg viewBox="0 0 20 20"><path d="M10 2.5 3.5 5.5v5c0 3.4 2.7 6 6.5 7 3.8-1 6.5-3.6 6.5-7v-5z"/></svg>
      Secure checkout · 30-day returns
    </p>`;

  if (options.coupon) {
    $("coupon-apply").addEventListener("click", applyCoupon);
    $("coupon-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } });
  }
  if (options.checkout) {
    $("go-checkout").addEventListener("click", () => {
      if (!state.user) { openAuth("login"); return; }
      show("checkout");
    });
  }
}

async function applyCoupon() {
  const code = $("coupon-input").value.trim();
  if (!code) { state.couponCode = null; return loadCart(); }
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
  const line = (state.bill?.lines || []).find((l) => l.productId === productId);
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
    toast("Removed from bag");
    loadCart();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ------------------------------ checkout ------------------------------ */

async function loadCheckout() {
  try {
    const bill = state.couponCode
      ? await api("/cart/quote", { method: "POST", body: { couponCode: state.couponCode } })
      : await api("/cart");
    state.bill = bill;
    if (!bill.lines.length) { toast("Your bag is empty", "error"); return show("shop"); }
    if (!$("co-name").value) $("co-name").value = state.user?.name || "";
    if (!$("co-phone").value) $("co-phone").value = state.user?.phone || "";
    if (!$("co-line1").value) $("co-line1").value = state.user?.address || "";
    renderSummary(bill, $("checkout-bill"), {});
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
  if (method === "COD") { field.hidden = true; input.value = ""; return; }
  field.hidden = false;
  if (method === "CARD") { label.textContent = "Card number"; input.placeholder = "4111 1111 1111 1111"; }
  else if (method === "UPI") { label.textContent = "UPI ID"; input.placeholder = "yourname@okhdfcbank"; }
  else { label.textContent = "Bank"; input.placeholder = "HDFC Bank"; }
}

document.querySelectorAll('input[name="pay"]').forEach((r) => r.addEventListener("change", updatePayDetail));

$("checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = $("co-pin").value.trim();
  if (!/^\d{6}$/.test(pin)) { toast("Enter a 6-digit PIN code", "error"); return; }

  const address = [
    $("co-name").value.trim(),
    $("co-line1").value.trim() + ($("co-line2").value.trim() ? ", " + $("co-line2").value.trim() : ""),
    $("co-city").value.trim() + ", " + $("co-state").value.trim() + " " + pin,
    $("co-phone").value.trim(),
  ].join(" · ");

  const button = $("place-order-btn");
  button.disabled = true;
  button.textContent = "Processing…";
  try {
    const order = await api("/checkout", {
      method: "POST",
      body: {
        shippingAddress: address,
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
    toast(error.message, "error"); // stay on the payment step so the user can retry
  } finally {
    button.disabled = false;
    button.textContent = "Pay and place order";
  }
});

function renderConfirmation(order) {
  $("confirmation-panel").innerHTML = `
    <span class="mark"><svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 7"/></svg></span>
    <h2>Thank you — your order is confirmed</h2>
    <p class="muted">A confirmation has been sent to ${esc(order.customerEmail)}.</p>
    <div class="order-ref">${esc(order.orderCode)}</div>
    <div class="sum-row"><span>Payment</span><span>${esc(PAY_LABELS[order.paymentMethod] || order.paymentMethod)} · ${esc(order.paymentStatus)}</span></div>
    <div class="sum-row"><span>Items</span><span>${order.items.reduce((s, i) => s + i.quantity, 0)}</span></div>
    <div class="sum-row total"><span>Total paid</span><span>${money(order.grandTotal)}</span></div>
    <p class="muted" style="margin-top:16px">Delivering to ${esc(order.shippingAddress)}</p>
    ${timelineHtml(order)}
    <div class="confirm-actions">
      <button class="btn btn-solid" data-nav="orders">Track order</button>
      <button class="btn btn-quiet" data-nav="shop">Continue shopping</button>
    </div>`;
}

/* ------------------------------ orders ------------------------------ */

function timelineHtml(order) {
  if (order.status === "CANCELLED") {
    return `<div class="timeline"><span class="tl-step current"><span class="tl-dot"></span>Cancelled</span></div>`;
  }
  const current = STATUS_FLOW.indexOf(order.status);
  return `<div class="timeline">${STATUS_FLOW.map((status, i) => {
    const cls = i < current ? "done" : i === current ? "current" : "";
    const label = status.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
    return `<span class="tl-step ${cls}"><span class="tl-dot"></span>${label}<span class="tl-bar"></span></span>`;
  }).join("")}</div>`;
}

async function loadOrders() {
  try {
    const orders = await api("/orders");
    if (!orders.length) {
      $("orders-list").innerHTML = `
        <div class="card" style="text-align:center;padding:56px 24px">
          <h2>No orders yet</h2>
          <p class="muted" style="margin:8px 0 20px">When you place an order it will appear here.</p>
          <button class="btn btn-solid" data-nav="shop">Start shopping</button>
        </div>`;
      return;
    }
    $("orders-list").innerHTML = orders
      .map(
        (order) => `
        <article class="order">
          <div class="order-top">
            <div>
              <div class="order-ref-sm">${esc(order.orderCode)}</div>
              <div class="order-meta">
                <span>${esc(order.createdAt)}</span>
                <span>${esc(PAY_LABELS[order.paymentMethod] || order.paymentMethod)} · ${esc(order.paymentStatus)}</span>
                <span>${order.items.reduce((s, i) => s + i.quantity, 0)} item(s)</span>
              </div>
            </div>
            <span class="pill ${esc(order.status)}">${esc(order.statusLabel)}</span>
          </div>
          ${timelineHtml(order)}
          <div class="order-items">
            ${order.items
              .map(
                (item) => `
              <div class="order-item">
                <span class="oi-left"><span class="oi-art">${productArt(item.image)}</span>${esc(item.name)} × ${item.quantity}</span>
                <span>${money(item.lineTotal)}</span>
              </div>`
              )
              .join("")}
          </div>
          <div class="order-foot">
            <strong>${money(order.grandTotal)}</strong>
            ${order.cancellable ? `<button class="btn btn-quiet btn-sm" data-cancel="${esc(order.orderCode)}">Cancel order</button>` : ""}
          </div>
        </article>`
      )
      .join("");

    $("orders-list").querySelectorAll("[data-cancel]").forEach((b) =>
      b.addEventListener("click", () => cancelOrder(b.dataset.cancel))
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function cancelOrder(orderCode) {
  if (!confirm("Cancel order " + orderCode + "? The items go back into stock.")) return;
  try {
    await api("/orders/" + orderCode + "/cancel", { method: "POST" });
    toast("Order cancelled", "success");
    loadOrders();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ------------------------------ account ------------------------------ */

async function loadAccount() {
  if (!state.user) { openAuth("login"); return; }
  const u = state.user;
  $("account-profile").innerHTML = `
    <h2>Profile</h2>
    <div class="kv"><span>Name</span><span>${esc(u.name)}</span></div>
    <div class="kv"><span>Email</span><span>${esc(u.email)}</span></div>
    <div class="kv"><span>Phone</span><span>${esc(u.phone)}</span></div>
    <div class="kv"><span>Delivery address</span><span>${esc(u.address || "—")}</span></div>
    <div class="kv"><span>Account type</span><span>${u.role === "ADMIN" ? "Administrator" : "Customer"}</span></div>
    <div class="hero-actions" style="margin:22px 0 0">
      <button class="btn btn-quiet btn-sm" data-nav="orders">View orders</button>
      ${u.role === "ADMIN" ? '<button class="btn btn-quiet btn-sm" data-nav="admin">Admin dashboard</button>' : ""}
    </div>`;

  try {
    const orders = await api("/orders");
    $("account-orders").innerHTML = `
      <h2>Recent orders</h2>
      ${orders.length
        ? orders.slice(0, 4).map((o) => `
            <div class="kv">
              <span>${esc(o.orderCode)}</span>
              <span>${money(o.grandTotal)} · ${esc(o.statusLabel)}</span>
            </div>`).join("")
        : '<p class="muted">No orders yet.</p>'}
      <button class="btn btn-quiet btn-sm" data-nav="orders" style="margin-top:18px">All orders</button>`;
  } catch (error) {
    $("account-orders").innerHTML = `<h2>Recent orders</h2><p class="muted">${esc(error.message)}</p>`;
  }
}

$("delete-account-btn").addEventListener("click", async () => {
  const password = $("delete-password").value;
  $("delete-hint").textContent = "";
  if (!password) { toast("Enter your password to confirm", "error"); return; }
  if (!confirm("Delete your account and all its data? This cannot be undone.")) return;
  try {
    const result = await api("/auth/account", { method: "DELETE", body: { password } });
    clearSession();
    toast(result.message, "success");
    show("shop");
    await loadCatalogue();
  } catch (error) {
    $("delete-hint").textContent = error.message;
    toast(error.message, "error");
  }
});

/* ------------------------------ admin ------------------------------ */

document.querySelectorAll("#admin-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    state.adminTab = tab.dataset.tab;
    document.querySelectorAll("#admin-tabs .tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    ["overview", "products", "orders"].forEach((name) => { $("tab-" + name).hidden = name !== state.adminTab; });
    if (state.adminTab === "products") loadAdminProducts();
    if (state.adminTab === "orders") loadAdminOrders();
    if (state.adminTab === "overview") loadReports();
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
    const r = await api("/admin/reports");
    const stats = [
      ["Revenue", money(r.revenue)],
      ["Orders", r.totalOrders],
      ["Delivered", r.delivered],
      ["In progress", r.placed + r.processing + r.shipped + r.outForDelivery],
      ["Cancelled", r.cancelled],
      ["Products", r.products],
      ["Low stock", r.lowStock],
      ["Customers", r.customers],
    ];
    $("stat-row").innerHTML = stats
      .map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`)
      .join("");

    $("low-stock").innerHTML = r.lowStockProducts.length
      ? `<table><thead><tr><th>Product</th><th>Stock</th></tr></thead><tbody>${r.lowStockProducts
          .map((p) => `<tr><td>${esc(p.name)}</td><td>${p.stock}</td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">Everything is comfortably in stock.</p>`;

    $("recent-orders").innerHTML = r.recentOrders.length
      ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th></tr></thead><tbody>${r.recentOrders
          .map((o) => `<tr><td>${esc(o.orderCode)}</td><td>${esc(o.customerName)}</td>
            <td><span class="pill ${esc(o.status)}">${esc(o.statusLabel)}</span></td><td>${money(o.grandTotal)}</td></tr>`)
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
    $("p-category").innerHTML = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    $("p-image").innerHTML = ART_KEYS.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");

    $("admin-products").innerHTML = `
      <table>
        <thead><tr><th>Product</th><th>Brand</th><th>Price</th><th>Stock</th><th>Rating</th><th></th></tr></thead>
        <tbody>${products.map((p) => `
          <tr>
            <td><span class="cell-product"><span class="cell-art">${productArt(p.image)}</span>${esc(p.name)}</span></td>
            <td>${esc(p.brand || "ShopCart")}</td>
            <td>${money(p.price)}</td>
            <td>${p.stock}</td>
            <td>${Number(p.rating || 0).toFixed(1)}</td>
            <td class="row-actions">
              <button class="btn btn-quiet btn-sm" data-edit="${p.id}">Edit</button>
              <button class="btn btn-quiet btn-sm" data-delete="${p.id}">Delete</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>`;

    $("admin-products").querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => fillProductForm(products.find((p) => p.id === Number(b.dataset.edit))))
    );
    $("admin-products").querySelectorAll("[data-delete]").forEach((b) =>
      b.addEventListener("click", () => deleteProduct(Number(b.dataset.delete)))
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

function fillProductForm(p) {
  state.editingProduct = p.id;
  $("product-form-title").textContent = "Edit product";
  $("p-id").value = p.id;
  $("p-name").value = p.name;
  $("p-brand").value = p.brand;
  $("p-price").value = p.price;
  $("p-mrp").value = p.mrp;
  $("p-stock").value = p.stock;
  $("p-image").value = p.image;
  $("p-rating").value = p.rating;
  $("p-reviews").value = p.reviewCount;
  $("p-description").value = p.description || "";
  const cat = state.categories.find((c) => c.name === p.category);
  if (cat) $("p-category").value = cat.id;
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
    brand: $("p-brand").value,
    price: Number($("p-price").value),
    mrp: Number($("p-mrp").value) || Number($("p-price").value),
    stock: Number($("p-stock").value),
    categoryId: Number($("p-category").value) || null,
    image: $("p-image").value || "package",
    rating: Number($("p-rating").value) || 0,
    reviewCount: Number($("p-reviews").value) || 0,
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
    if (!orders.length) { $("admin-orders").innerHTML = '<p class="muted">No orders yet.</p>'; return; }
    $("admin-orders").innerHTML = `
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Placed</th><th>Total</th><th>Status</th><th>Move to</th></tr></thead>
        <tbody>${orders.map((o) => `
          <tr>
            <td>${esc(o.orderCode)}</td>
            <td>${esc(o.customerName)}<div class="muted">${esc(o.customerEmail)}</div></td>
            <td>${esc(o.createdAt)}</td>
            <td>${money(o.grandTotal)}</td>
            <td><span class="pill ${esc(o.status)}">${esc(o.statusLabel)}</span></td>
            <td>
              <select class="mini-select" data-order="${esc(o.orderCode)}">
                <option value="">Change…</option>
                <option value="PROCESSING">Processing</option>
                <option value="SHIPPED">Shipped</option>
                <option value="OUT_FOR_DELIVERY">Out for delivery</option>
                <option value="DELIVERED">Delivered</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </td>
          </tr>`).join("")}</tbody>
      </table>`;

    $("admin-orders").querySelectorAll("[data-order]").forEach((select) => {
      select.addEventListener("change", async () => {
        if (!select.value) return;
        try {
          await api("/admin/orders/" + select.dataset.order + "/status", { method: "PATCH", body: { status: select.value } });
          toast("Order updated", "success");
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

(function boot() {
  renderSession();
  $("hero-art").innerHTML = productArt("headphones");
  $("footer-api").textContent = API_BASE ? "API: " + API_BASE : "API: not configured";

  if (STATIC_HOST) {
    if (!API_BASE) {
      showBackendBanner("<strong>Backend not connected.</strong> This storefront is hosted as a static site and needs the ShopCart API.");
      $("product-grid").innerHTML = "";
      return;
    }
  }

  loadCatalogue();
  if (state.user) refreshCartCount();
  show("shop");
})();
