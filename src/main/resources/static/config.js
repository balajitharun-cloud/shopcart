/*
 * Storefront runtime configuration.
 *
 * Served by Spring Boot: leave apiBase empty ("") so the page calls the same origin.
 * Published on GitHub Pages: set apiBase to your deployed backend, for example
 *
 *   window.SHOPCART_CONFIG = { apiBase: "https://shopcart-api.onrender.com" };
 *
 * No trailing slash. Reload the page after editing.
 */
window.SHOPCART_CONFIG = {
  apiBase: "",
  staticHost: false,
};
