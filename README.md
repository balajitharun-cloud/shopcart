# ShopCart - Online Shopping Cart

A complete online shopping cart web application built from the plain-text algorithm
(`A. Main algorithm` through `I. Admin algorithm`): **Java 17 + Spring Boot 3** REST backend,
embedded **H2** database, and a dependency-free **HTML/CSS/JS** storefront served by the same app.

Everything runs with one command, seeds its own demo catalogue, and was verified end to end -
50 API checks pass, and the UI flow (register/login → browse → cart → coupon → checkout →
payment failure retry → confirmation → tracking → admin) was driven in headless Chrome with no
console errors.

---

## Quick start

```bash
# requires JDK 17+ and Maven 3.9+
mvn spring-boot:run
```

or

```bash
mvn -DskipTests package
java -jar target/shopcart-1.0.0.jar
```

Then open **http://localhost:8080**. If port 8080 is taken: `java -jar target/shopcart-1.0.0.jar --server.port=8090`.

The H2 database is created on first run at `./data/shopcart.mv.db` and seeded with 5 categories,
13 products, 2 accounts and 2 coupons. Delete the `data/` folder to start fresh.

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Customer | `tharun@example.com` | `Passw0rd` |
| Admin | `admin@shopcart.in` | `Admin@123` |

### Demo coupons

| Code | Effect | Condition |
|------|--------|-----------|
| `WELCOME10` | 10% off the subtotal | none |
| `FLAT100` | ₹100 off | subtotal ≥ ₹999 |

### Demo payment gateway

There is no real gateway (no credentials needed). Rules that let you exercise every branch of
Algorithm G:

| Method | Detail to enter | Result |
|--------|-----------------|--------|
| Card | `4111 1111 1111 1111` | success |
| UPI | `tharun@okhdfcbank` | success |
| Net Banking | `HDFC Bank` | success |
| Card / UPI | anything containing the word `fail` | declined → 402, user returns to the payment step |
| Cash on Delivery | (no detail) | order placed, payment status `PENDING` |

---

## How the algorithm maps to the code

| Algorithm | Where it lives |
|-----------|----------------|
| **A. Main flow** (steps 7-28) | `CatalogController`, `CartController`, `OrderController`, `OrderService.checkout` |
| **B. Registration** (validate → duplicate check → hash → save) | `AuthService.register` |
| **C. Login** (lookup → hash compare → 3-strike lock → session) | `AuthService.login`, `AuthInterceptor` |
| **D. Add to cart** (stock check → merge or insert) | `CartService.add` |
| **E. View / update cart** (qty, remove, continue) | `CartService.updateQuantity`, `CartService.remove` |
| **F. Total calculation** (subtotal, tax, shipping, coupon, grand total) | `PricingService.quote` |
| **G. Payment** (COD shortcut, gateway, record) | `PaymentService.charge`, `OrderService.checkout` |
| **H. Order tracking** (fetch, status timeline, cancel + restock) | `OrderService.get`, `OrderService.cancel`, `OrderEvent` |
| **I. Admin** (product CRUD, order status, reports) | `AdminService`, `AdminController` |

### Pricing rules (Algorithm F)

Configured in `src/main/resources/application.yml`:

```yaml
app:
  pricing:
    tax-rate: 0.18              # 18% GST
    free-shipping-limit: 999.00
    shipping-charge: 79.00
```

`grandTotal = subtotal + tax + shipping - discount`, all in `BigDecimal` with `HALF_UP` rounding.
The browser only *displays* the bill - the server recomputes it at checkout, so a tampered page
cannot change what is charged.

### Order status flow (Algorithm H)

```
PLACED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
   ↘ PROCESSING ↘
        CANCELLED   (allowed only while PLACED or PROCESSING; stock is returned)
```

Transitions are enforced by `OrderStatus.canTransitionTo`, so the admin cannot jump
`PLACED → DELIVERED`.

---

## API reference

All responses are JSON. Protected endpoints need `Authorization: Bearer <token>` (the token comes
back from `/api/auth/login` and lasts 24 hours).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | Algorithm B |
| POST | `/api/auth/login` | Algorithm C, returns `{token, user}` |
| POST | `/api/auth/logout` | Destroy the session |
| GET | `/api/auth/me` | Current user |
| GET | `/api/config` | Public tax / shipping / support settings |
| GET | `/api/catalog/categories` | Categories |
| GET | `/api/catalog/products?category=&q=` | Search and filter |
| GET | `/api/catalog/products/{id}` | Product detail |
| GET | `/api/cart` | Cart + bill |
| POST | `/api/cart/quote` | Bill preview with `{couponCode}` |
| POST | `/api/cart/items` | Add `{productId, quantity}` |
| PATCH | `/api/cart/items/{productId}` | Update `{quantity}` (0 removes) |
| DELETE | `/api/cart/items/{productId}` | Remove one line |
| DELETE | `/api/cart` | Clear the cart |
| POST | `/api/checkout` | `{shippingAddress, paymentMethod, paymentDetail, couponCode}` |
| GET | `/api/orders` | My orders |
| GET | `/api/orders/{orderCode}` | One order with its status timeline |
| POST | `/api/orders/{orderCode}/cancel` | Cancel + restock |
| GET | `/api/admin/reports` | Sales / stock / user report |
| GET/POST/PUT/DELETE | `/api/admin/products[/{id}]` | Catalogue management |
| GET | `/api/admin/orders` | All orders |
| PATCH | `/api/admin/orders/{orderCode}/status` | `{status}` |

Errors are always `{status, message, timestamp}` (see `GlobalExceptionHandler`), e.g. `409` for
insufficient stock, `402` for a declined payment, `423` for a locked account.

---

## Project layout

```
src/main/java/com/shopcart/
  config/     AuthInterceptor, AuthContext, WebConfig, PasswordConfig, AppException, GlobalExceptionHandler
  model/      User, SessionToken, Category, Product, CartItem, Order, OrderItem, OrderEvent, Payment, Coupon
  repo/       Spring Data JPA repositories
  service/    AuthService, CatalogService, CartService, PricingService, PaymentService,
              OrderService, AdminService, NotificationService, DataSeeder
  web/        AuthController, CatalogController, CartController, OrderController, AdminController
  dto/        Dtos.java - every request/response record
src/main/resources/
  application.yml
  static/     index.html, styles.css, app.js (the storefront)
scripts/
  smoke-test.py   end-to-end API test (starts the jar, runs 50 checks, shuts it down)
```

---

## Design decisions worth knowing

- **Session tokens, not JWT.** A random 32-char token is stored in `user_sessions` with an expiry;
  logout deletes it server-side, so revocation actually works. `AuthInterceptor` resolves the
  token to a user for every `/api/**` call except register/login/catalogue.
- **Failed logins commit.** `AuthService.login` is `@Transactional(noRollbackFor = AppException.class)`
  - without that, throwing "invalid password" would roll back the attempt counter and the
  3-strike lock would never trigger.
- **No overselling.** `checkout` locks the product rows (`PESSIMISTIC_WRITE`), re-checks stock,
  then decrements, all in one transaction. Two buyers racing for the last unit cannot both win.
- **Order items snapshot price and name**, so editing a product later never rewrites history.
- **Soft delete for products** (`active = false`) so past orders keep a valid reference.
- **Only masked instruments are stored** (`Card ****1234`, `t***@okhdfcbank`) - never raw card data.
- **Password hashing** is BCrypt via `spring-security-crypto` (no Spring Security auto-config, so
  the security model stays explicit and small).
- **Email/SMS is logged**, not sent. `NotificationService` is the single seam - drop in
  `JavaMailSender` or an SMS provider there and nothing else changes.

## Deploying

The project ships in two pieces because GitHub Pages only serves static files:

| Piece | Where it runs | What it is |
|-------|---------------|------------|
| Storefront | GitHub Pages | `docs/` - `index.html`, `styles.css`, `app.js`, `config.js` |
| REST API | Render / Railway / any Docker host | the Spring Boot jar (needs a JVM, so it cannot run on Pages) |

### 1. Storefront on GitHub Pages

Push the repo, then **Settings → Pages → Source: Deploy from a branch → `main` / `/docs`**.
The site appears at `https://<user>.github.io/<repo>/`.

Then point it at the API by editing **`docs/config.js`**:

```js
window.SHOPCART_CONFIG = {
  apiBase: "https://shopcart-api.onrender.com",   // no trailing slash
};
```

While `apiBase` is empty the page shows a banner explaining that the backend is not connected
instead of failing silently. `docs/config.js` is the only file that needs to change per environment.

### 2. Backend on Render

`render.yaml` is a ready blueprint:

1. Render dashboard → **New → Blueprint** → pick this repo.
2. It builds `Dockerfile`, health-checks `/api/config`, and sets
   `APP_CORS_ALLOWED_ORIGINS=https://<user>.github.io` so the Pages origin is allowed.
3. Note the service URL (`https://shopcart-api.onrender.com`) and put it in `docs/config.js`.

Free instances sleep after ~15 minutes of inactivity, so the first request afterwards takes
20-30 seconds. Their filesystem is ephemeral - the H2 file is lost on redeploy. For durable data,
attach a Render PostgreSQL instance and set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`
and `SPRING_DATASOURCE_PASSWORD` (Hibernate creates the schema on first boot).

### 3. Backend on Railway or any Docker host

```bash
railway init
railway up
railway variables set APP_CORS_ALLOWED_ORIGINS=https://<user>.github.io
```

Or anywhere Docker runs:

```bash
docker build -t shopcart .
docker run -p 8080:8080 -e APP_CORS_ALLOWED_ORIGINS=https://<user>.github.io shopcart
```

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | HTTP port (Render and Railway set this themselves) |
| `APP_CORS_ALLOWED_ORIGINS` | localhost + the Pages origin | comma-separated origins allowed to call `/api/**` |
| `SPRING_DATASOURCE_URL` | `jdbc:h2:file:./data/shopcart` | database JDBC URL |
| `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` | `sa` / empty | database credentials |

## Troubleshooting

Run the doctor before guessing - it checks the toolchain, the port and the build, then starts the API:

```bash
bash doctor.sh            # diagnose + run on http://localhost:8080
PORT=8090 bash doctor.sh  # if 8080 is taken
```

It prints one `[ok]`/`[FAIL]` line per check and a verdict, so the failing step is obvious.

| Symptom | Cause | Fix |
|---------|-------|-----|
| `mvn: command not found` | no JDK/Maven in the container | open the project in the devcontainer (`.devcontainer/devcontainer.json` ships Java 17 + Maven); in Codespaces run *Rebuild Container* |
| `Port 8080 was already in use` | another process owns the port | `PORT=8090 bash doctor.sh` |
| `java 17 or newer is required` | older JDK | install JDK 17+ or use the devcontainer |
| started, but the browser shows nothing | wrong URL | open exactly the URL the log prints; in Codespaces use the **Ports** tab link, not `localhost` |
| `Cannot reach the API` on the Pages site | backend not public / asleep / wrong URL | make the forwarded port **Public** (Codespaces) or wake the Render service, then reload |
| `Database may be already in use: ".../data/shopcart.mv.db"` | a previous run is still alive and holds the H2 file | stop it (below), then start once - or use a separate database: `--spring.datasource.url=jdbc:h2:file:./data/shopcart2` |
| a wall of errors after running the command twice | the first instance still owns port 8080 and the database file | `bash doctor.sh` tells you it is already running; stop the old one first |

### Stopping a run

One instance only - the H2 database is a single-writer file.

```bash
# macOS / Linux
pkill -f shopcart-1.0.0.jar      # or: Ctrl+C in the terminal running it
lsof -i :8080                    # see what still holds the port
rm -f data/shopcart.lock.db      # only after the process is gone

# Windows
netstat -ano | findstr :8080
taskkill /PID <pid> /F
```

## Running the tests

```bash
mvn -DskipTests package
python3 scripts/smoke-test.py     # starts the app on :8090, runs 50 checks, stops it
```

Covers: catalogue/search, registration validation and duplicate email, login lockout after 3
attempts, add-to-cart merge and stock guards, coupon maths, quantity update, declined payment
retry, successful checkout, stock decrement, cart clearing, order tracking, cancel + restock,
illegal status jumps, admin product CRUD, admin report and role protection.

## Production notes

This is a demo build; before shipping you would want to:

1. Point `spring.datasource` at PostgreSQL/MySQL and manage schema with Flyway/Liquibase instead of
   `ddl-auto: update`.
2. Replace `PaymentService.charge` with a real gateway (Razorpay/Stripe) and handle webhooks and
   idempotency keys.
3. Serve over HTTPS, add rate limiting on `/api/auth/login`, and use `Secure`/`HttpOnly` cookies
   instead of a `localStorage` token.
4. Move notifications onto a queue so checkout is not blocked by email/SMS latency.
5. Add pagination to the catalogue and admin order list once the data grows.
