/*
 * ShopCart storefront configuration for the GitHub Pages build.
 *
 * Set apiBase to the URL of the deployed Spring Boot backend (no trailing slash),
 * for example:  apiBase: "https://shopcart-api.onrender.com"
 *
 * Leave it empty to fall back to same-origin (only works when Spring Boot serves this page).
 */
window.SHOPCART_CONFIG = {
  apiBase: "https://solitary-fishsticks-7v654x5v9ww53w59-8080.app.github.dev",
  // true = this page is served by a static host, so an empty apiBase means "not connected yet"
  staticHost: true,
};
