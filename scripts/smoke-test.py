"""Start the Spring Boot app, exercise the whole algorithm through the REST API, then shut it down."""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8090"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JAR = os.path.join(ROOT, "target", "shopcart-1.0.0.jar")
JAVA = os.environ.get("JAVA_BIN", "java")
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

results = []


def call(method, path, body=None, token=None, expect=200, label=""):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with opener.open(req, timeout=20) as resp:
            status = resp.status
            raw = resp.read().decode()
    except urllib.error.HTTPError as err:
        status = err.code
        raw = err.read().decode()
    try:
        payload = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        payload = raw

    ok = status == expect
    message = payload.get("message") if isinstance(payload, dict) else ""
    results.append((ok, f"{method} {path}", status, expect, label, message))
    if not ok:
        print(f"FAIL {method} {path} -> {status} (expected {expect}) {raw[:300]}")
    return payload


def wait_until_up(deadline=150):
    start = time.time()
    while time.time() - start < deadline:
        try:
            with opener.open(BASE + "/api/config", timeout=3) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(1.5)
    return False


def main():
    env = dict(os.environ)
    env.setdefault("JAVA_TOOL_OPTIONS", "-Xmx512m -XX:MaxMetaspaceSize=256m")
    log = open(os.path.join(ROOT, "smoke-test.log"), "w")
    if not os.path.exists(JAR):
        print("Build the jar first: mvn -DskipTests package")
        return 2
    proc = subprocess.Popen(
        [JAVA, "-jar", JAR, "--server.port=8090"],
        cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
        preexec_fn=os.setsid,
    )
    try:
        if not wait_until_up():
            print("SERVER DID NOT START")
            return 1
        print("server up")

        # ---- static frontend ----
        with opener.open(BASE + "/", timeout=10) as resp:
            html = resp.read().decode()
        results.append(("ShopCart" in html, "GET / (index.html)", resp.status, 200, "frontend served", ""))

        # ---- catalogue (Algorithm A steps 7-10) ----
        cats = call("GET", "/api/catalog/categories", label="categories")
        prods = call("GET", "/api/catalog/products", label="product list")
        call("GET", "/api/catalog/products?q=headphones", label="search")
        call("GET", "/api/catalog/products?category=books", label="category filter")
        headphones = next(p for p in prods if "Headphones" in p["name"])
        serum = next(p for p in prods if "Sunscreen" in p["name"])
        cheap = next(p for p in prods if p["price"] < 700 and p["stock"] > 0)

        # ---- registration (B) ----
        call("POST", "/api/auth/register", {
            "name": "Test Buyer", "email": "buyer@test.in", "phone": "+91 90000 55555",
            "password": "Secret123", "address": "5, Brigade Road, Bengaluru 560001",
        }, expect=200, label="register new user")
        call("POST", "/api/auth/register", {
            "name": "Dup", "email": "buyer@test.in", "phone": "+91 90000 55555",
            "password": "Secret123", "address": "x",
        }, expect=409, label="duplicate email rejected")
        call("POST", "/api/auth/register", {
            "name": "Bad", "email": "not-an-email", "phone": "+91 90000 55555",
            "password": "Secret123", "address": "x",
        }, expect=400, label="invalid email rejected")

        # ---- login (C) with lockout ----
        call("POST", "/api/auth/login", {"email": "nobody@test.in", "password": "x"}, expect=401,
             label="unknown email")
        for attempt in (1, 2):
            call("POST", "/api/auth/login", {"email": "buyer@test.in", "password": "wrong"},
                 expect=401, label=f"wrong password {attempt}")
        call("POST", "/api/auth/login", {"email": "buyer@test.in", "password": "wrong"},
             expect=423, label="account locked after 3 attempts")

        auth = call("POST", "/api/auth/login", {"email": "tharun@example.com", "password": "Passw0rd"},
                    label="customer login")
        token = auth["token"]
        call("GET", "/api/auth/me", token=token, label="session resolves")
        call("GET", "/api/cart", expect=401, label="cart needs auth")

        # ---- cart (D) ----
        call("POST", "/api/cart/items", {"productId": headphones["id"], "quantity": 2}, token=token,
             label="add headphones x2")
        call("POST", "/api/cart/items", {"productId": headphones["id"], "quantity": 1}, token=token,
             label="add same product again (merges)")
        call("POST", "/api/cart/items", {"productId": serum["id"], "quantity": 1}, token=token,
             expect=409, label="out of stock rejected")
        call("POST", "/api/cart/items", {"productId": headphones["id"], "quantity": 999}, token=token,
             expect=409, label="insufficient stock rejected")
        bill = call("GET", "/api/cart", token=token, label="view cart + bill (F)")
        assert bill["lines"][0]["quantity"] == 3, bill
        expected_sub = round(headphones["price"] * 3, 2)
        assert abs(bill["subtotal"] - expected_sub) < 0.01, bill
        assert abs(bill["tax"] - round(expected_sub * 0.18, 2)) < 0.01, bill
        print(f"  bill: subtotal={bill['subtotal']} tax={bill['tax']} shipping={bill['shipping']} total={bill['grandTotal']}")

        # ---- coupon (F step 6) ----
        quoted = call("POST", "/api/cart/quote", {"couponCode": "WELCOME10"}, token=token, label="coupon WELCOME10")
        assert abs(quoted["discount"] - round(quoted["subtotal"] * 0.10, 2)) < 0.01, quoted
        call("POST", "/api/cart/quote", {"couponCode": "NOPE"}, token=token, expect=400, label="invalid coupon")

        # ---- update / remove (E) ----
        call("PATCH", f"/api/cart/items/{headphones['id']}", {"quantity": 1}, token=token, label="update qty")
        call("PATCH", f"/api/cart/items/{headphones['id']}", {"quantity": 500}, token=token,
             expect=409, label="qty above stock rejected")
        call("POST", "/api/cart/items", {"productId": cheap["id"], "quantity": 1}, token=token,
             label="add cheap product")
        call("DELETE", f"/api/cart/items/{cheap['id']}", token=token, label="remove item")

        # ---- payment failure then retry (A steps 20-21, G) ----
        call("POST", "/api/checkout", {
            "shippingAddress": "12, MG Road, Bengaluru 560001", "paymentMethod": "CARD",
            "paymentDetail": "4111 1111 1111 1111 fail",
        }, token=token, expect=402, label="declined payment rejected")
        call("POST", "/api/checkout", {
            "shippingAddress": "12, MG Road, Bengaluru 560001", "paymentMethod": "UPI",
            "paymentDetail": "notaupi",
        }, token=token, expect=400, label="invalid UPI id rejected")

        order = call("POST", "/api/checkout", {
            "shippingAddress": "12, MG Road, Bengaluru 560001", "paymentMethod": "UPI",
            "paymentDetail": "tharun@okhdfcbank", "couponCode": "WELCOME10",
        }, token=token, label="successful UPI checkout")
        print(f"  order {order['orderCode']} total={order['grandTotal']} status={order['statusLabel']}")

        after = call("GET", "/api/cart", token=token, label="cart cleared after order")
        assert after["itemCount"] == 0, after
        stock_after = call("GET", f"/api/catalog/products/{headphones['id']}", label="stock reduced")
        assert stock_after["stock"] == headphones["stock"] - 1, (stock_after["stock"], headphones["stock"])

        # ---- orders + tracking (H) ----
        my_orders = call("GET", "/api/orders", token=token, label="my orders")
        assert any(o["orderCode"] == order["orderCode"] for o in my_orders), my_orders
        call("GET", f"/api/orders/{order['orderCode']}", token=token, label="order detail")

        # ---- admin (I) ----
        admin = call("POST", "/api/auth/login", {"email": "admin@shopcart.in", "password": "Admin@123"},
                     label="admin login")
        atoken = admin["token"]
        call("GET", "/api/admin/reports", token=token, expect=403, label="customer blocked from admin")
        report = call("GET", "/api/admin/reports", token=atoken, label="admin report")
        print(f"  report: orders={report['totalOrders']} revenue={report['revenue']} lowStock={report['lowStock']}")
        call("PATCH", f"/api/admin/orders/{order['orderCode']}/status", {"status": "PROCESSING"},
             token=atoken, label="admin marks processing")
        call("PATCH", f"/api/admin/orders/{order['orderCode']}/status", {"status": "SHIPPED"},
             token=atoken, label="admin marks shipped")
        call("PATCH", f"/api/admin/orders/{order['orderCode']}/status", {"status": "DELIVERED"},
             token=atoken, expect=409, label="illegal status jump blocked")

        created = call("POST", "/api/admin/products", {
            "name": "Test Lamp", "description": "Seeded by the test run", "price": 1299.5,
            "stock": 7, "categoryId": cats[0]["id"], "image": "💡",
        }, token=atoken, label="admin adds product")
        call("PUT", f"/api/admin/products/{created['id']}", {
            "name": "Test Lamp v2", "price": 1199.0, "stock": 9,
            "categoryId": cats[0]["id"], "image": "💡", "description": "Updated",
        }, token=atoken, label="admin updates product")
        call("DELETE", f"/api/admin/products/{created['id']}", token=atoken, label="admin deletes product")

        # ---- cancel restores stock (H step 5) ----
        second = call("POST", "/api/cart/items", {"productId": headphones["id"], "quantity": 2}, token=token,
                      label="re-add headphones")
        order2 = call("POST", "/api/checkout", {
            "shippingAddress": "12, MG Road, Bengaluru 560001", "paymentMethod": "COD",
        }, token=token, label="COD checkout")
        assert order2["paymentStatus"] == "PENDING", order2
        stock_before_cancel = call("GET", f"/api/catalog/products/{headphones['id']}", label="stock after COD order")
        cancelled = call("POST", f"/api/orders/{order2['orderCode']}/cancel", token=token, label="cancel order")
        assert cancelled["status"] == "CANCELLED", cancelled
        stock_restored = call("GET", f"/api/catalog/products/{headphones['id']}", label="stock restored")
        assert stock_restored["stock"] == stock_before_cancel["stock"] + 2, stock_restored
        call("POST", f"/api/orders/{order['orderCode']}/cancel", token=token, expect=409,
             label="cannot cancel a shipped order")

        # ---- account closure ----
        call("POST", "/api/auth/register", {
            "name": "Delete Me", "email": "delete.me@test.in", "phone": "+91 90000 22222",
            "password": "Secret123", "address": "9 Test Lane, Bengaluru 560001",
        }, expect=200, label="register a throwaway account")
        throwaway = call("POST", "/api/auth/login",
                         {"email": "delete.me@test.in", "password": "Secret123"}, label="throwaway login")
        call("DELETE", "/api/auth/account", {"password": "nope"}, token=throwaway["token"],
             expect=403, label="delete needs the right password")
        call("DELETE", "/api/auth/account", {"password": "Secret123"}, token=throwaway["token"],
             expect=200, label="account deleted")
        call("POST", "/api/auth/login", {"email": "delete.me@test.in", "password": "Secret123"},
             expect=401, label="deleted account cannot log in")
        call("DELETE", "/api/auth/account", {"password": "Admin@123"}, token=atoken,
             expect=409, label="last admin cannot delete itself")

        # ---- logout ----
        call("POST", "/api/auth/logout", token=token, label="logout")
        call("GET", "/api/orders", token=token, expect=401, label="token invalid after logout")

        passed = sum(1 for ok, *_ in results if ok)
        print(f"\n{passed}/{len(results)} checks passed")
        failures = [r for r in results if not r[0]]
        for failure in failures:
            print("  FAILED:", failure)
        return 0 if not failures else 1
    finally:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=30)
        log.close()


if __name__ == "__main__":
    sys.exit(main())
