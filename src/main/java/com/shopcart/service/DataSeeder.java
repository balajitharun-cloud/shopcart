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
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * Seeds demo catalogue, accounts and coupons on first run so the shop is usable immediately.
 *
 * <p>Runs as a {@link SmartInitializingSingleton} rather than a CommandLineRunner: runners execute
 * after the web server is already accepting traffic, which left a window where the first requests
 * (very noticeable on a cold-starting host) saw an empty catalogue.</p>
 */
@Component
public class DataSeeder implements SmartInitializingSingleton {

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
    public void afterSingletonsInstantiated() {
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

    /**
     * Catalogue. Every brand here is a fictional parody invented for this demo - no real
     * company makes or endorses these products, and the names are deliberately misspelled.
     */
    private void seedCatalogue() {
        boolean current = products.count() > 0
                && products.findAll().stream().allMatch(p -> p.getBrand() != null);
        if (current) {
            return;
        }
        if (products.count() > 0) {
            products.deleteAll(); // rows seeded before brands existed
        }
        Category electronics = categories.save(new Category("Electronics", "electronics"));
        Category fashion = categories.save(new Category("Fashion", "fashion"));
        Category home = categories.save(new Category("Home & Kitchen", "home-kitchen"));
        Category books = categories.save(new Category("Books", "books"));
        Category beauty = categories.save(new Category("Beauty", "beauty"));

        List<Product> catalogue = List.of(
                product("Soniq WH-900 Wireless Headphones", "Soniq",
                        "Adaptive noise cancelling, 40 hours of playback, USB-C fast charge and a fold-flat case.",
                        "24990.00", "29990.00", 12, electronics, "headphones", 4.6, 1284),
                product("Pome Watch SE 40mm", "Pome",
                        "Aluminium case, always-on display, ECG and sleep tracking, 18-hour battery.",
                        "27900.00", "29900.00", 18, electronics, "watch", 4.7, 2140),
                product("Samsun 65W GaN Trio Charger", "Samsun",
                        "Two USB-C ports and one USB-A, folds flat, charges a laptop and a phone together.",
                        "3499.00", "4499.00", 4, electronics, "charger", 4.4, 512),
                product("Keytron K8 TKL Keyboard", "Keytron",
                        "Hot-swappable brown switches, double-shot PBT caps, wired and Bluetooth.",
                        "6499.00", "7999.00", 8, electronics, "keyboard", 4.5, 738),
                product("Nyke Air Rush Running Shoes", "Nyke",
                        "Responsive foam midsole, engineered mesh upper, 8mm drop, weighs 241g.",
                        "8999.00", "11999.00", 22, fashion, "sneakers", 4.3, 1904),
                product("Levy's 511 Slim Jeans", "Levy's",
                        "Stretch cotton denim, slim through the leg, five-pocket styling.",
                        "3299.00", "4599.00", 30, fashion, "jeans", 4.2, 861),
                product("Uniclo Oversized Cotton Tee", "Uniclo",
                        "240 GSM combed cotton, boxy fit, pre-shrunk, unisex sizing.",
                        "999.00", "1490.00", 40, fashion, "tshirt", 4.1, 3120),
                product("Miltun Thermosteel Flask 1L", "Miltun",
                        "Double-walled vacuum steel, 24 hours cold and 12 hours hot, leak-proof lid.",
                        "1299.00", "1799.00", 25, home, "bottle", 4.5, 2670),
                product("Celo Airtight Container Set", "Celo",
                        "Six BPA-free containers with measurement lids, stackable and freezer safe.",
                        "1499.00", "2199.00", 3, home, "containers", 4.0, 402),
                product("Prestigio Cast Iron Skillet 10in", "Prestigio",
                        "Pre-seasoned, oven safe to 260C, restaurant-grade iron, stay-cool handle.",
                        "2499.00", "3199.00", 10, home, "skillet", 4.6, 588),
                product("Designing Data-Heavy Systems", "O'Reily",
                        "Martin Kleppman. The ideas behind reliable, scalable and maintainable systems.",
                        "1799.00", "2250.00", 15, books, "book", 4.8, 1320),
                product("The Pragmatic Craft", "Addison-Wesly",
                        "Andrew Hunt. From journeyman to master - practices that age well.",
                        "1450.00", "1800.00", 6, books, "book2", 4.7, 940),
                product("Minima 10% Vitamin C Serum", "Minima",
                        "Stabilised vitamin C with hyaluronic acid and vitamin E, 30ml, fragrance free.",
                        "699.00", "899.00", 22, beauty, "serum", 4.4, 1875),
                product("Plume Matte Sunscreen SPF 50", "Plume",
                        "Broad spectrum UVA/UVB, no white cast, sweat resistant for 80 minutes.",
                        "549.00", "699.00", 0, beauty, "sunscreen", 4.2, 1130)
        );
        products.saveAll(catalogue);
    }

    private Product product(String name, String brand, String description, String price, String mrp,
                            int stock, Category category, String image, double rating, int reviewCount) {
        Product product = new Product();
        product.setName(name);
        product.setBrand(brand);
        product.setDescription(description);
        product.setPrice(new BigDecimal(price));
        product.setMrp(new BigDecimal(mrp));
        product.setStock(stock);
        product.setCategory(category);
        product.setImage(image);
        product.setRating(rating);
        product.setReviewCount(reviewCount);
        product.setActive(true);
        return product;
    }
}
