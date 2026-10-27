/* ShopCart storefront — hash-routed single page app talking to the Spring Boot API. */

const CONFIG = window.SHOPCART_CONFIG || {};
const API_OVERRIDE =
  new URLSearchParams(location.search).get("api") ||
  localStorage.getItem("shopcart.apiBase") ||
  "";
const API_BASE = String(API_OVERRIDE || CONFIG.apiBase || "").replace(/\/+$/, "");
const STATIC_HOST = CONFIG.staticHost === true;

const STATUS_FLOW = ["PLACED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
const PAY_LABELS = { CARD: "Card", UPI: "UPI", NET_BANKING: "Net banking", COD: "Cash on delivery" };
const RECENT_KEY = "shopcart.recent";

const state = {
  token: localStorage.getItem("shopcart.token") || null,
  user: JSON.parse(localStorage.getItem("shopcart.user") || "null"),
  categories: [],
  products: [],
  category: "all",
  query: "",
  sort: "featured",
  filters: { brands: new Set(), price: "all", rating: 0, inStock: false },
  bill: null,
  couponCode: null,
  pending: null,
  wishIds: new Set(),
  adminTab: "overview",
  editingProduct: null,
  reviewRating: 5,
};

const $ = (id) => document.getElementById(id);
const money = (value) => {
  const n = Number(value || 0);
  const paise = Math.round(Math.abs(n) * 100) % 100 !== 0;
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: paise ? 2 : 0, maximumFractionDigits: 2 });
};
const discountPct = (price, mrp) =>
  mrp && Number(mrp) > Number(price) ? Math.round((1 - Number(price) / Number(mrp)) * 100) : 0;
const esc = (t) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ api ------------------------------ */

async function api(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && state.token) headers.Authorization = "Bearer " + state.token;

  let response;
  try {
    response = await fetch(API_BASE + "/api" + path, {
      method, headers, body: body === null ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const hint = /\.app\.github\.dev\/?$/.test(API_BASE)
      ? " A Codespaces URL cannot serve a separate site - open it directly instead."
      : "";
    throw new Error(API_BASE
      ? "Cannot reach the API at " + API_BASE + ". Is the backend awake and CORS allowed for this origin?" + hint
      : "No API configured. Set apiBase in docs/config.js.");
  }

  const raw = await response.text();
  const isJson = (response.headers.get("content-type") || "").includes("json");
  let data = null;
  if (raw && isJson) { try { data = JSON.parse(raw); } catch (_) { data = null; } }

  if (!response.ok || !isJson) {
    let fallback = "Request failed (" + response.status + ").";
    if (response.ok && !isJson) fallback = "The backend replied with a web page instead of JSON.";
    else if (response.status === 404) fallback = "API endpoint not found. Check apiBase.";
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

/* ------------------------------ router ------------------------------ */

const ROUTES = [
  [/^$/, "shop", () => renderShop()],
  [/^shop$/, "shop", () => renderShop()],
  [/^product\/(\d+)$/, "product", (m) => renderProduct(Number(m[1]))],
  [/^cart$/, "cart", () => loadCart()],
  [/^checkout$/, "checkout", () => loadCheckout()],
  [/^orders$/, "orders", () => loadOrders()],
  [/^wishlist$/, "wishlist", () => loadWishlistPage()],
  [/^account$/, "account", () => loadAccount()],
  [/^admin$/, "admin", () => loadAdmin()],
];

function currentPath() { return location.hash.replace(/^#\/?/, ""); }
function go(path) {
  if (currentPath() === path) { route(); return; }
  location.hash = "#/" + path;
}

function route() {
  const path = currentPath();
  for (const [re, view, run] of ROUTES) {
    const match = path.match(re);
    if (match) {
      ["shop", "product", "cart", "checkout", "confirmation", "orders", "wishlist", "account", "admin"]
        .forEach((name) => { $("view-" + name).hidden = name !== view; });
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
      run(match);
      return;
    }
  }
  go("shop");
}

window.addEventListener("hashchange", route);

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    event.preventDefault();
    const target = nav.dataset.nav;
    if ((target === "cart" || target === "orders" || target === "account" || target === "wishlist") && !state.user) {
      openAuth("login");
      return;
    }
    go(target);
    return;
  }
  if (event.target.closest("[data-scroll-grid]")) {
    $("product-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const close = event.target.closest("[data-close]");
  if (close) $(close.dataset.close).hidden = true;
  if (event.target === $("drawer-backdrop")) $("drawer-backdrop").hidden = true;
});

/* ------------------------------ session ------------------------------ */

function renderSession() {
  const signedIn = !!state.user;
  $("account-label").textContent = signedIn ? state.user.name.split(" ")[0] : "Sign in";
  $("hero-orders").hidden = !signedIn;
  if (!signedIn) { $("cart-count").textContent = "0"; $("wish-count").textContent = "0"; }
}

function applySession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem("shopcart.token", state.token);
  localStorage.setItem("shopcart.user", JSON.stringify(state.user));
  renderSession();
  $("auth-modal").hidden = true;
  refreshCartCount();
  loadWishlistIds();
}

function clearSession() {
  state.token = null;
  state.user = null;
  state.bill = null;
  state.couponCode = null;
  state.wishIds = new Set();
  localStorage.removeItem("shopcart.token");
  localStorage.removeItem("shopcart.user");
  renderSession();
}

$("account-btn").addEventListener("click", () => (state.user ? go("account") : openAuth("login")));
$("wishlist-btn").addEventListener("click", () => (state.user ? go("wishlist") : openAuth("login")));

/* ------------------------------ auth ------------------------------ */

function openAuth(mode = "login") {
  $("auth-modal").hidden = false;
  setAuthTab(mode);
}

function setAuthTab(mode) {
  document.querySelectorAll("[data-auth]").forEach((t) => t.classList.toggle("is-active", t.dataset.auth === mode));
  $("login-form").hidden = mode !== "login";
  $("register-form").hidden = mode !== "register";
}

document.querySelectorAll("[data-auth]").forEach((tab) =>
  tab.addEventListener("click", () => setAuthTab(tab.dataset.auth))
);

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await api("/auth/login", {
      method: "POST", auth: false,
      body: { email: $("login-email").value, password: $("login-password").value },
    });
    applySession(payload);
    toast("Signed in as " + payload.user.name.split(" ")[0], "success");
    if (state.pending) {
      const pending = state.pending;
      state.pending = null;
      await addToCart(pending.productId, pending.quantity);
    }
    route();
  } catch (error) { toast(error.message, "error"); }
});

$("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/auth/register", {
      method: "POST", auth: false,
      body: {
        name: $("reg-name").value, email: $("reg-email").value, phone: $("reg-phone").value,
        password: $("reg-password").value, address: $("reg-address").value,
      },
    });
    toast(result.message, "success");
    $("login-email").value = $("reg-email").value;
    $("register-form").reset();
    setAuthTab("login");
  } catch (error) { toast(error.message, "error"); }
});

$("account-signout").addEventListener("click", async () => {
  try { await api("/auth/logout", { method: "POST" }); } catch (_) { /* already gone */ }
  clearSession();
  go("shop");
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
      showBackendBanner("<strong>Waking the backend…</strong> free hosts sleep when idle. Retrying (" + attempt + "/3).");
      await sleep(4000 * attempt);
      return loadCatalogue(attempt + 1);
    }
    toast(error.message, "error");
    if (STATIC_HOST) showBackendBanner("<strong>The catalogue could not be loaded.</strong> " + esc(error.message));
  }
}

function renderCategoryBar() {
  const items = [{ slug: "all", name: "All" }, ...state.categories];
  $("category-bar").innerHTML = items
    .map((c) => `<button class="nav-item ${state.category === c.slug ? "is-active" : ""}" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`)
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
    renderBrandFilters();
    renderShop();
  } catch (error) { toast(error.message, "error"); }
}

function renderBrandFilters() {
  const brands = [...new Set(state.products.map((p) => p.brand).filter(Boolean))].sort();
  $("filter-brands").innerHTML = brands
    .map((b) => `<label class="check"><input type="checkbox" value="${esc(b)}" ${state.filters.brands.has(b) ? "checked" : ""} /><span>${esc(b)}</span></label>`)
    .join("");
  $("filter-brands").querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      input.checked ? state.filters.brands.add(input.value) : state.filters.brands.delete(input.value);
      renderShop();
    });
  });
}

function filteredProducts() {
  let list = state.products.filter((p) => {
    if (state.filters.brands.size && !state.filters.brands.has(p.brand)) return false;
    if (state.filters.inStock && p.stock === 0) return false;
    if (state.filters.rating && p.rating < state.filters.rating) return false;
    const [min, max] = state.filters.price.split("-");
    if (min && p.price < Number(min)) return false;
    if (max && p.price > Number(max)) return false;
    return true;
  });
  if (state.sort === "price-asc") list.sort((a, b) => a.price - b.price);
  if (state.sort === "price-desc") list.sort((a, b) => b.price - a.price);
  if (state.sort === "rating") list.sort((a, b) => b.rating - a.rating);
  if (state.sort === "discount") list.sort((a, b) => discountPct(b.price, b.mrp) - discountPct(a.price, a.mrp));
  return list;
}

function productTag(p) {
  const off = discountPct(p.price, p.mrp);
  if (p.stock === 0) return '<span class="tag low">Sold out</span>';
  if (off >= 20) return `<span class="tag sale">${off}% off</span>`;
  if (p.reviewCount >= 2000 && p.rating >= 4.6) return '<span class="tag">Bestseller</span>';
  if (p.stock <= 5) return '<span class="tag low">Low stock</span>';
  return "";
}

function cardHtml(p) {
  const off = discountPct(p.price, p.mrp);
  const out = p.stock === 0;
  const saved = state.wishIds.has(p.id);
  return `
    <article class="card-product">
      <div class="card-art" data-open="${p.id}">
        ${productTag(p)}
        <button class="wish-heart ${saved ? "is-saved" : ""}" data-wish="${p.id}" aria-label="Save to wishlist">
          <svg viewBox="0 0 20 20"><path d="M10 16.5S3.5 12.4 3.5 8.2A3.2 3.2 0 0 1 10 6.4a3.2 3.2 0 0 1 6.5 1.8c0 4.2-6.5 8.3-6.5 8.3Z" /></svg>
        </button>
        <button class="quick-add" data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Sold out" : "Add to bag"}</button>
        ${productMedia(p.image)}
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
}

function wireCards(root) {
  root.querySelectorAll("[data-open]").forEach((el) =>
    el.addEventListener("click", (event) => {
      if (event.target.closest("[data-add]") || event.target.closest("[data-wish]")) return;
      go("product/" + el.dataset.open);
    })
  );
  root.querySelectorAll("[data-add]").forEach((btn) =>
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      addToCart(Number(btn.dataset.add), 1);
    })
  );
  root.querySelectorAll("[data-wish]").forEach((btn) =>
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleWish(Number(btn.dataset.wish));
    })
  );
}

function renderShop() {
  const list = filteredProducts();
  $("product-count").textContent = list.length + (list.length === 1 ? " product" : " products");
  $("shop-empty").hidden = list.length > 0;
  $("product-grid").innerHTML = list.map(cardHtml).join("");
  wireCards($("product-grid"));
  renderRecentRail();
}

let searchTimer = null;
$("search-input").addEventListener("input", (event) => {
  const term = event.target.value.trim();
  state.query = term;
  renderSuggestions(term);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadProducts, 280);
});

function renderSuggestions(term) {
  const box = $("suggest");
  if (!term) { box.hidden = true; return; }
  const lower = term.toLowerCase();
  const hits = state.products
    .filter((p) => p.name.toLowerCase().includes(lower) || (p.brand || "").toLowerCase().includes(lower))
    .slice(0, 6);
  if (!hits.length) { box.hidden = true; return; }
  box.innerHTML = hits
    .map((p) => `
      <div class="suggest-item" data-open="${p.id}">
        <span class="si-art">${productMedia(p.image)}</span>
        <span><span class="si-brand">${esc(p.brand || "")}</span><br />${esc(p.name)}</span>
        <span class="si-price">${money(p.price)}</span>
      </div>`)
    .join("");
  box.hidden = false;
  box.querySelectorAll("[data-open]").forEach((el) =>
    el.addEventListener("click", () => {
      box.hidden = true;
      $("search-input").value = "";
      state.query = "";
      go("product/" + el.dataset.open);
    })
  );
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-wrap")) $("suggest").hidden = true;
});

$("sort-select").addEventListener("change", (event) => { state.sort = event.target.value; renderShop(); });

document.querySelectorAll('input[name="price"]').forEach((r) =>
  r.addEventListener("change", () => { state.filters.price = r.value; renderShop(); })
);
document.querySelectorAll('input[name="rating"]').forEach((r) =>
  r.addEventListener("change", () => { state.filters.rating = Number(r.value); renderShop(); })
);
$("filter-stock").addEventListener("change", (event) => { state.filters.inStock = event.target.checked; renderShop(); });

function clearFilters() {
  state.filters = { brands: new Set(), price: "all", rating: 0, inStock: false };
  document.querySelectorAll('input[name="price"]').forEach((r) => { r.checked = r.value === "all"; });
  document.querySelectorAll('input[name="rating"]').forEach((r) => { r.checked = r.value === "0"; });
  $("filter-stock").checked = false;
  renderBrandFilters();
  renderShop();
}
$("clear-filters").addEventListener("click", clearFilters);
$("clear-filters-2").addEventListener("click", clearFilters);

/* ------------------------------ recently viewed ------------------------------ */

function pushRecent(id) {
  const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((x) => x !== id);
  list.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
}

function renderRecentRail() {
  const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  const items = ids.map((id) => state.products.find((p) => p.id === id)).filter(Boolean).slice(0, 6);
  $("rail-head").hidden = items.length < 2;
  $("recent-rail").hidden = items.length < 2;
  if (items.length < 2) return;
  $("recent-rail").innerHTML = items
    .map((p) => `
      <div class="rail-card" data-open="${p.id}">
        <div class="rail-art">${productMedia(p.image)}</div>
        <span class="rail-brand">${esc(p.brand || "")}</span>
        <span class="rail-name">${esc(p.name)}</span>
        <span class="price">${money(p.price)}</span>
      </div>`)
    .join("");
  wireCards($("recent-rail"));
}

/* ------------------------------ product page ------------------------------ */

async function renderProduct(id) {
  pushRecent(id);
  try {
    const [p, reviews] = await Promise.all([
      api("/catalog/products/" + id, { auth: false }),
      api("/catalog/products/" + id + "/reviews", { auth: false }).catch(() => ({ average: 0, count: 0, distribution: [0, 0, 0, 0, 0], reviews: [] })),
    ]);
    const off = discountPct(p.price, p.mrp);
    const out = p.stock === 0;
    const saved = state.wishIds.has(id);

    $("product-crumbs").innerHTML = `
      <a href="#/shop" data-nav="shop">Home</a><span class="sep">/</span>
      <a href="#/shop" data-nav="shop">${esc(p.category)}</a><span class="sep">/</span>
      <span>${esc(p.name)}</span>`;

    $("product-page").innerHTML = `
      <div class="gallery">
        <div class="gallery-main">${productMedia(p.image)}</div>
        <div class="gallery-note">
          <span>Free delivery over ₹999</span><span>30-day returns</span><span>2-year warranty</span>
        </div>
      </div>
      <div class="product-info">
        <p class="pd-brand">${esc(p.brand || "ShopCart")} · ${esc(p.category)}</p>
        <h1>${esc(p.name)}</h1>
        <div class="rating-row">
          ${starsSvg(p.rating)}<strong>${Number(p.rating || 0).toFixed(1)}</strong>
          <a href="#reviews" id="jump-reviews">${p.reviewCount || 0} ratings</a>
          ${out ? '<span class="stock-note">Sold out</span>' : p.stock <= 5 ? `<span class="stock-note">Only ${p.stock} left</span>` : ""}
        </div>
        <div class="price-block">
          <span class="price">${money(p.price)}</span>
          ${off > 0 ? `<span class="mrp">${money(p.mrp)}</span><span class="off">${off}% off</span>` : ""}
        </div>
        <p class="tax-note">Inclusive of all taxes${off > 0 ? ` · You save ${money(p.mrp - p.price)}` : ""}</p>
        <p class="pd-desc">${esc(p.description)}</p>

        <div class="pincode">
          <label for="pin-input">Delivery options</label>
          <div class="pincode-row">
            <input id="pin-input" inputmode="numeric" maxlength="6" placeholder="Enter PIN code" />
            <button class="btn btn-quiet btn-sm" id="pin-check">Check</button>
          </div>
          <p class="pincode-result" id="pin-result">Enter your PIN code for an estimated delivery date.</p>
        </div>

        <div class="buy-row">
          <div class="qty">
            <button type="button" id="pd-minus" aria-label="Decrease">−</button>
            <span id="pd-qty">1</span>
            <button type="button" id="pd-plus" aria-label="Increase">+</button>
          </div>
          <button class="btn btn-solid" id="pd-add" ${out ? "disabled" : ""}>${out ? "Sold out" : "Add to bag"}</button>
          <button class="wish-btn ${saved ? "is-saved" : ""}" id="pd-wish">
            <svg viewBox="0 0 20 20"><path d="M10 16.5S3.5 12.4 3.5 8.2A3.2 3.2 0 0 1 10 6.4a3.2 3.2 0 0 1 6.5 1.8c0 4.2-6.5 8.3-6.5 8.3Z" /></svg>
            ${saved ? "Saved" : "Save"}
          </button>
        </div>

        <ul class="pd-facts">
          <li><svg viewBox="0 0 20 20"><path d="M2 6h9v8H2zM11 8h4l3 3v3h-7z"/><circle cx="6" cy="15" r="1.6"/><circle cx="15" cy="15" r="1.6"/></svg>
            ${out ? "Currently unavailable" : "In stock — dispatched within 24 hours"}</li>
          <li><svg viewBox="0 0 20 20"><path d="M10 2.5 3.5 5.5v5c0 3.4 2.7 6 6.5 7 3.8-1 6.5-3.6 6.5-7v-5z"/></svg>
            Secure payment · UPI, cards, net banking, COD</li>
          <li><svg viewBox="0 0 20 20"><path d="M3 10.5 8 15l9-9"/></svg>
            Easy 30-day returns, no questions asked</li>
        </ul>
      </div>`;

    let qty = 1;
    $("pd-minus").addEventListener("click", () => { qty = Math.max(1, qty - 1); $("pd-qty").textContent = qty; });
    $("pd-plus").addEventListener("click", () => { qty = Math.min(p.stock || 1, qty + 1); $("pd-qty").textContent = qty; });
    $("pd-add").addEventListener("click", () => addToCart(p.id, qty));
    $("pd-wish").addEventListener("click", () => toggleWish(p.id, true));
    $("jump-reviews").addEventListener("click", (e) => { e.preventDefault(); $("product-reviews").scrollIntoView({ behavior: "smooth" }); });
    $("pin-check").addEventListener("click", () => checkPincode(p));
    $("pin-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); checkPincode(p); } });

    renderReviews(id, reviews);
    renderRelated(p);
    document.title = p.name + " — ShopCart";
  } catch (error) {
    toast(error.message, "error");
    go("shop");
  }
}

function checkPincode(p) {
  const pin = $("pin-input").value.trim();
  const out = $("pin-result");
  if (!/^\d{6}$/.test(pin)) { out.innerHTML = "Enter a valid 6-digit PIN code."; return; }
  const days = 2 + (Number(pin[0]) % 3);
  const date = new Date();
  date.setDate(date.getDate() + days);
  const label = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const free = Number(p.price) >= 999;
  out.innerHTML = `Delivering to <strong>${pin}</strong> by <strong>${label}</strong> · ${free ? "Free delivery" : "₹79 delivery"} · Cash on delivery available`;
}

function renderRelated(p) {
  const related = state.products
    .filter((x) => x.id !== p.id && x.category === p.category)
    .slice(0, 6);
  const items = related.length ? related : state.products.filter((x) => x.id !== p.id).slice(0, 6);
  $("related-head").hidden = items.length === 0;
  $("related-rail").hidden = items.length === 0;
  $("related-rail").innerHTML = items
    .map((x) => `
      <div class="rail-card" data-open="${x.id}">
        <div class="rail-art">${productMedia(x.image)}</div>
        <span class="rail-brand">${esc(x.brand || "")}</span>
        <span class="rail-name">${esc(x.name)}</span>
        <span class="price">${money(x.price)}</span>
      </div>`)
    .join("");
  wireCards($("related-rail"));
}

function renderReviews(productId, summary) {
  const total = summary.count || 0;
  const dist = summary.distribution || [0, 0, 0, 0, 0];
  const max = Math.max(1, ...dist);
  const form = state.user
    ? `<form class="review-form" id="review-form">
         <h3>Write a review</h3>
         <div class="star-pick" id="star-pick">
           ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="${n <= state.reviewRating ? "on" : ""}" aria-label="${n} star"><svg viewBox="0 0 20 20"><path d="${"M10 1.6l2.55 5.2 5.75.8-4.15 4.05 1 5.7-5.15-2.7-5.15 2.7 1-5.7L1.7 7.6l5.75-.8z"}"/></svg></button>`).join("")}
         </div>
         <label class="field"><span>Title</span><input id="review-title" required maxlength="80" placeholder="Sums up your experience" /></label>
         <label class="field"><span>Your review</span><textarea id="review-body" rows="3" placeholder="What did you like or dislike?"></textarea></label>
         <button class="btn btn-solid btn-sm" type="submit">Publish review</button>
       </form>`
    : `<div class="review-form"><h3>Write a review</h3><p class="muted">Sign in to share your experience.</p>
         <button class="btn btn-quiet btn-sm" id="review-signin" style="margin-top:12px">Sign in</button></div>`;

  $("product-reviews").innerHTML = `
    <h2 id="reviews">Ratings and reviews</h2>
    <div class="reviews-grid" style="margin-top:22px">
      <div>
        <div class="review-score">${(summary.average || 0).toFixed(1)}<span> / 5</span></div>
        <div class="rating">${starsSvg(summary.average || 0)}<span>${total} written review${total === 1 ? "" : "s"}</span></div>
        <div style="margin-top:16px">
          ${dist.map((count, i) => `
            <div class="dist-row"><span>${5 - i}★</span><span class="dist-bar"><i style="width:${(count / max) * 100}%"></i></span><span>${count}</span></div>`).join("")}
        </div>
      </div>
      <div>
        ${form}
        ${(summary.reviews || []).map((r) => `
          <div class="review-item">
            <div class="review-head">${starsSvg(r.rating)}<strong>${esc(r.author)}</strong><span class="muted">${esc(r.createdAt)}</span></div>
            <p class="review-title">${esc(r.title)}</p>
            <p class="review-body">${esc(r.body)}</p>
          </div>`).join("") || '<p class="muted">No written reviews yet — be the first.</p>'}
      </div>
    </div>`;

  if (state.user) {
    $("star-pick").querySelectorAll("[data-star]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.reviewRating = Number(btn.dataset.star);
        $("star-pick").querySelectorAll("[data-star]").forEach((b) =>
          b.classList.toggle("on", Number(b.dataset.star) <= state.reviewRating)
        );
      })
    );
    $("review-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const summaryNow = await api("/products/" + productId + "/reviews", {
          method: "POST",
          body: { rating: state.reviewRating, title: $("review-title").value, body: $("review-body").value },
        });
        toast("Thanks — your review is live", "success");
        renderReviews(productId, summaryNow);
        loadProducts();
      } catch (error) { toast(error.message, "error"); }
    });
  } else {
    $("review-signin").addEventListener("click", () => openAuth("login"));
  }
}

/* ------------------------------ wishlist ------------------------------ */

async function loadWishlistIds() {
  if (!state.user) { state.wishIds = new Set(); $("wish-count").textContent = "0"; return; }
  try {
    const items = await api("/wishlist");
    state.wishIds = new Set(items.map((p) => p.id));
    $("wish-count").textContent = String(items.length);
  } catch (_) { /* ignore */ }
}

async function toggleWish(productId, onProductPage = false) {
  if (!state.user) { openAuth("login"); return; }
  const saved = state.wishIds.has(productId);
  try {
    await api("/wishlist/" + productId, { method: saved ? "DELETE" : "POST" });
    saved ? state.wishIds.delete(productId) : state.wishIds.add(productId);
    $("wish-count").textContent = String(state.wishIds.size);
    toast(saved ? "Removed from wishlist" : "Saved to wishlist");
    if (currentPath().startsWith("product/")) renderProduct(productId);
    else renderShop();
    if (currentPath() === "wishlist") loadWishlistPage();
  } catch (error) { toast(error.message, "error"); }
}

async function loadWishlistPage() {
  try {
    const items = await api("/wishlist");
    state.wishIds = new Set(items.map((p) => p.id));
    $("wish-count").textContent = String(items.length);
    $("wishlist-empty").hidden = items.length > 0;
    $("wishlist-grid").innerHTML = items.map(cardHtml).join("");
    wireCards($("wishlist-grid"));
  } catch (error) { toast(error.message, "error"); }
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
    await openDrawer();
    if (currentPath() === "cart") loadCart();
  } catch (error) { toast(error.message, "error"); }
}

async function refreshCartCount() {
  if (!state.user) { $("cart-count").textContent = "0"; return; }
  try {
    const bill = await api("/cart");
    $("cart-count").textContent = bill.itemCount;
  } catch (_) { $("cart-count").textContent = "0"; }
}

async function openDrawer() {
  try {
    const bill = await api("/cart");
    $("drawer-body").innerHTML = `
      ${bill.lines.slice(0, 4).map((line) => `
        <div class="drawer-line">
          <div class="dl-art">${productMedia(line.image)}</div>
          <div>
            <div class="dl-name">${esc(line.name)}</div>
            <div class="dl-meta">${line.quantity} × ${money(line.price)}</div>
          </div>
        </div>`).join("")}
      <div class="drawer-total"><span>Bag subtotal</span><span>${money(bill.subtotal)}</span></div>
      <button class="btn btn-solid btn-block" data-nav="cart">View bag (${bill.itemCount})</button>
      <button class="btn btn-quiet btn-block" data-nav="checkout" style="margin-top:10px">Checkout</button>`;
    $("drawer-backdrop").hidden = false;
  } catch (error) { toast(error.message, "error"); }
}

$("drawer-close").addEventListener("click", () => { $("drawer-backdrop").hidden = true; });

async function loadCart() {
  try {
    const bill = state.couponCode
      ? await api("/cart/quote", { method: "POST", body: { couponCode: state.couponCode } })
      : await api("/cart");
    state.bill = bill;
    renderCart(bill);
  } catch (error) {
    if (error.status === 400 && state.couponCode) { state.couponCode = null; return loadCart(); }
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

  $("cart-lines").innerHTML = bill.lines.map((line) => `
    <div class="line">
      <div class="line-art">${productMedia(line.image)}</div>
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
          <button class="line-remove" data-save="${line.productId}">Save for later</button>
        </div>
      </div>
      <div class="line-total">${money(line.subtotal)}</div>
    </div>`).join("");

  $("cart-lines").querySelectorAll("[data-inc]").forEach((b) =>
    b.addEventListener("click", () => updateQuantity(Number(b.dataset.inc), Number(b.dataset.max))));
  $("cart-lines").querySelectorAll("[data-dec]").forEach((b) =>
    b.addEventListener("click", () => updateQuantity(Number(b.dataset.dec), null)));
  $("cart-lines").querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => removeItem(Number(b.dataset.remove))));
  $("cart-lines").querySelectorAll("[data-save]").forEach((b) =>
    b.addEventListener("click", async () => {
      await toggleWish(Number(b.dataset.save));
      await removeItem(Number(b.dataset.save), true);
    }));

  renderSummary(bill, $("bill-panel"), { coupon: true, checkout: true });
}

function renderSummary(bill, target, options = {}) {
  const free = Number(bill.shipping) === 0;
  const gap = Number(bill.freeShippingGap || 0);
  const progress = Math.min(100, Math.round(((Number(bill.subtotal)) / (Number(bill.subtotal) + gap || 1)) * 100));
  target.innerHTML = `
    <h2>Order summary</h2>
    ${gap > 0
      ? `<div class="ship-note">Add ${money(gap)} more for free delivery
           <span class="dist-bar" style="display:block;margin-top:8px"><i style="width:${progress}%"></i></span></div>`
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
      go("checkout");
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
  } catch (error) { toast(error.message, "error"); }
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
  } catch (error) { toast(error.message, "error"); }
}

async function removeItem(productId, quiet = false) {
  try {
    await api("/cart/items/" + productId, { method: "DELETE" });
    if (!quiet) toast("Removed from bag");
    loadCart();
  } catch (error) { toast(error.message, "error"); }
}

/* ------------------------------ checkout ------------------------------ */

async function loadCheckout() {
  try {
    const bill = state.couponCode
      ? await api("/cart/quote", { method: "POST", body: { couponCode: state.couponCode } })
      : await api("/cart");
    state.bill = bill;
    if (!bill.lines.length) { toast("Your bag is empty", "error"); return go("shop"); }
    if (!$("co-name").value) $("co-name").value = state.user?.name || "";
    if (!$("co-phone").value) $("co-phone").value = state.user?.phone || "";
    if (!$("co-line1").value) $("co-line1").value = state.user?.address || "";
    renderSummary(bill, $("checkout-bill"), {});
    updatePayDetail();
  } catch (error) { toast(error.message, "error"); }
}

function currentPayMethod() { return document.querySelector('input[name="pay"]:checked').value; }

function updatePayDetail() {
  const method = currentPayMethod();
  const field = $("pay-detail-field");
  const input = $("pay-detail");
  if (method === "COD") { field.hidden = true; input.value = ""; return; }
  field.hidden = false;
  if (method === "CARD") { $("pay-detail-label").textContent = "Card number"; input.placeholder = "4111 1111 1111 1111"; }
  else if (method === "UPI") { $("pay-detail-label").textContent = "UPI ID"; input.placeholder = "yourname@okhdfcbank"; }
  else { $("pay-detail-label").textContent = "Bank"; input.placeholder = "HDFC Bank"; }
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
    ["shop", "product", "cart", "checkout", "orders", "wishlist", "account", "admin"]
      .forEach((name) => { $("view-" + name).hidden = name !== "confirmation"; });
    $("view-confirmation").hidden = false;
    window.scrollTo({ top: 0 });
  } catch (error) {
    toast(error.message, "error");
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
    $("orders-list").innerHTML = orders.map((order) => `
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
          ${order.items.map((item) => `
            <div class="order-item">
              <span class="oi-left"><span class="oi-art">${productMedia(item.image)}</span>${esc(item.name)} × ${item.quantity}</span>
              <span>${money(item.lineTotal)}</span>
            </div>`).join("")}
        </div>
        <div class="order-foot">
          <strong>${money(order.grandTotal)}</strong>
          ${order.cancellable ? `<button class="btn btn-quiet btn-sm" data-cancel="${esc(order.orderCode)}">Cancel order</button>` : ""}
        </div>
      </article>`).join("");

    $("orders-list").querySelectorAll("[data-cancel]").forEach((b) =>
      b.addEventListener("click", () => cancelOrder(b.dataset.cancel)));
  } catch (error) { toast(error.message, "error"); }
}

async function cancelOrder(orderCode) {
  if (!confirm("Cancel order " + orderCode + "? The items go back into stock.")) return;
  try {
    await api("/orders/" + orderCode + "/cancel", { method: "POST" });
    toast("Order cancelled", "success");
    loadOrders();
  } catch (error) { toast(error.message, "error"); }
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
      <button class="btn btn-quiet btn-sm" data-nav="wishlist">Wishlist</button>
      ${u.role === "ADMIN" ? '<button class="btn btn-quiet btn-sm" data-nav="admin">Admin dashboard</button>' : ""}
    </div>`;

  try {
    const orders = await api("/orders");
    $("account-orders").innerHTML = `
      <h2>Recent orders</h2>
      ${orders.length
        ? orders.slice(0, 4).map((o) => `<div class="kv"><span>${esc(o.orderCode)}</span><span>${money(o.grandTotal)} · ${esc(o.statusLabel)}</span></div>`).join("")
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
    go("shop");
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
  if (!state.user || state.user.role !== "ADMIN") { toast("Admin access only", "error"); return go("shop"); }
  await loadReports();
  if (state.adminTab === "products") await loadAdminProducts();
  if (state.adminTab === "orders") await loadAdminOrders();
}

async function loadReports() {
  try {
    const r = await api("/admin/reports");
    const stats = [
      ["Revenue", money(r.revenue)], ["Orders", r.totalOrders], ["Delivered", r.delivered],
      ["In progress", r.placed + r.processing + r.shipped + r.outForDelivery],
      ["Cancelled", r.cancelled], ["Products", r.products], ["Low stock", r.lowStock], ["Customers", r.customers],
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
            <td><span class="pill ${esc(o.status)}">${esc(o.statusLabel)}</span></td><td>${money(o.grandTotal)}</td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">No orders yet.</p>`;
  } catch (error) { toast(error.message, "error"); }
}

async function loadAdminProducts() {
  try {
    const [products, categories] = await Promise.all([api("/admin/products"), api("/admin/categories")]);
    state.categories = categories;
    $("p-category").innerHTML = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    const artOptions = [
      ...PHOTO_KEYS.map((k) => [k, "Photo · " + k]),
      ...ART_KEYS.filter(([k]) => !PHOTO_KEYS.includes(k)).map(([k, label]) => [k, "Illustration · " + label]),
    ];
    $("p-image").innerHTML = artOptions.map(([k, label]) => `<option value="${k}">${label}</option>`).join("");

    $("admin-products").innerHTML = `
      <table>
        <thead><tr><th>Product</th><th>Brand</th><th>Price</th><th>Stock</th><th>Rating</th><th></th></tr></thead>
        <tbody>${products.map((p) => `
          <tr>
            <td><span class="cell-product"><span class="cell-art">${productMedia(p.image)}</span>${esc(p.name)}</span></td>
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
      b.addEventListener("click", () => fillProductForm(products.find((p) => p.id === Number(b.dataset.edit)))));
    $("admin-products").querySelectorAll("[data-delete]").forEach((b) =>
      b.addEventListener("click", () => deleteProduct(Number(b.dataset.delete))));
  } catch (error) { toast(error.message, "error"); }
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
    name: $("p-name").value, brand: $("p-brand").value,
    price: Number($("p-price").value), mrp: Number($("p-mrp").value) || Number($("p-price").value),
    stock: Number($("p-stock").value), categoryId: Number($("p-category").value) || null,
    image: $("p-image").value || "package", rating: Number($("p-rating").value) || 0,
    reviewCount: Number($("p-reviews").value) || 0, description: $("p-description").value, active: true,
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
  } catch (error) { toast(error.message, "error"); }
});

async function deleteProduct(id) {
  if (!confirm("Remove this product from the catalogue?")) return;
  try {
    const result = await api("/admin/products/" + id, { method: "DELETE" });
    toast(result.message, "success");
    loadAdminProducts();
  } catch (error) { toast(error.message, "error"); }
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
        } catch (error) { toast(error.message, "error"); select.value = ""; }
      });
    });
  } catch (error) { toast(error.message, "error"); }
}

/* ------------------------------ footer ------------------------------ */

$("newsletter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("newsletter-hint").textContent = "Thanks — this is a demo, so no email was sent.";
  $("newsletter-form").reset();
});

/* ------------------------------ boot ------------------------------ */

(async function boot() {
  renderSession();
  $("hero-art").innerHTML = productMedia("laptop");
  $("footer-api").textContent = API_BASE ? "API: " + API_BASE : "API: not configured";

  if (STATIC_HOST && !API_BASE) {
    showBackendBanner("<strong>Backend not connected.</strong> This storefront is hosted as a static site and needs the ShopCart API.");
    return;
  }

  await loadCatalogue();
  if (state.user) { refreshCartCount(); loadWishlistIds(); }
  route();
})();
