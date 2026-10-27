package com.shopcart.service;

import com.shopcart.model.Category;
import com.shopcart.model.CouponType;
import com.shopcart.model.Product;
import com.shopcart.model.Role;
import com.shopcart.model.User;
import com.shopcart.repo.CategoryRepository;
import com.shopcart.repo.ProductRepository;
import com.shopcart.repo.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/** Seeds demo catalogue, accounts and coupons on first run so the shop is usable immediately. */
@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final CategoryRepository categories;
    private final ProductRepository products;
    private final UserRepository users;
    private final AdminService adminService;
    private final PasswordEncoder passwordEncoder;

    public DataSeeder(CategoryRepository categories, ProductRepository products, UserRepository users,
                      AdminService adminService, PasswordEncoder passwordEncoder) {
        this.categories = categories;
        this.products = products;
        this.users = users;
        this.adminService = adminService;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        seedUsers();
        seedCatalogue();
        adminService.seedCoupon("WELCOME10", CouponType.PERCENT, new BigDecimal("10"), new BigDecimal("0"));
        adminService.seedCoupon("FLAT100", CouponType.FLAT, new BigDecimal("100"), new BigDecimal("999"));
        log.info("Seed data ready. Admin: admin@shopcart.in / Admin@123 | Customer: tharun@example.com / Passw0rd");
    }

    private void seedUsers() {
        if (users.count() > 0) {
            return;
        }
        User admin = new User();
        admin.setName("Store Admin");
        admin.setEmail("admin@shopcart.in");
        admin.setPhone("+91 98765 43210");
        admin.setAddress("ShopCart HQ, Bengaluru, Karnataka");
        admin.setPasswordHash(passwordEncoder.encode("Admin@123"));
        admin.setRole(Role.ADMIN);
        users.save(admin);

        User customer = new User();
        customer.setName("Tharun");
        customer.setEmail("tharun@example.com");
        customer.setPhone("+91 90000 12345");
        customer.setAddress("12, MG Road, Bengaluru, Karnataka 560001");
        customer.setPasswordHash(passwordEncoder.encode("Passw0rd"));
        customer.setRole(Role.CUSTOMER);
        users.save(customer);
    }

    private void seedCatalogue() {
        if (products.count() > 0) {
            return;
        }
        Category electronics = categories.save(new Category("Electronics", "electronics"));
        Category fashion = categories.save(new Category("Fashion", "fashion"));
        Category home = categories.save(new Category("Home & Kitchen", "home-kitchen"));
        Category books = categories.save(new Category("Books", "books"));
        Category beauty = categories.save(new Category("Beauty", "beauty"));

        List<Product> catalogue = List.of(
                product("Wireless Noise-Cancelling Headphones", "40 hours playback, hybrid ANC, USB-C fast charge.",
                        "8999.00", 12, electronics, "🎧"),
                product("Smart Fitness Band 6", "AMOLED display, SpO2, 14-day battery, 5 ATM water resistance.",
                        "2499.00", 30, electronics, "⌚"),
                product("65W GaN Fast Charger", "Dual USB-C ports, charges a laptop and phone together.",
                        "1899.00", 4, electronics, "🔌"),
                product("Mechanical Keyboard TKL", "Hot-swappable brown switches, per-key RGB, wired + Bluetooth.",
                        "4299.00", 8, electronics, "⌨️"),
                product("Cotton Oversized T-Shirt", "240 GSM combed cotton, unisex fit, pre-shrunk.",
                        "799.00", 40, fashion, "👕"),
                product("Everyday Canvas Sneakers", "Cushioned insole, vulcanised rubber sole, unisex sizes.",
                        "1599.00", 18, fashion, "👟"),
                product("Stainless Steel Water Bottle 1L", "Double-walled vacuum insulation, 24h cold / 12h hot.",
                        "649.00", 25, home, "🧴"),
                product("Airtight Kitchen Container Set", "Set of 6 BPA-free containers with measurement lids.",
                        "1199.00", 3, home, "🍱"),
                product("Pre-Seasoned Cast Iron Skillet", "10 inch, oven safe, restaurant-grade seasoning.",
                        "1799.00", 10, home, "🍳"),
                product("Clean Code (Paperback)", "Robert C. Martin - a handbook of agile software craftsmanship.",
                        "1099.00", 15, books, "📘"),
                product("Designing Data-Intensive Applications", "Martin Kleppmann - the big ideas behind reliable systems.",
                        "1799.00", 6, books, "📗"),
                product("Vitamin C Face Serum 30ml", "10% stabilised vitamin C with hyaluronic acid.",
                        "549.00", 22, beauty, "🧪"),
                product("Matte Sunscreen SPF 50", "Broad spectrum, no white cast, sweat resistant.",
                        "449.00", 0, beauty, "☀️")
        );
        products.saveAll(catalogue);
    }

    private Product product(String name, String description, String price, int stock,
                            Category category, String image) {
        Product product = new Product();
        product.setName(name);
        product.setDescription(description);
        product.setPrice(new BigDecimal(price));
        product.setStock(stock);
        product.setCategory(category);
        product.setImage(image);
        product.setActive(true);
        return product;
    }
}
