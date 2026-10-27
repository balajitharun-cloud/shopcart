package com.shopcart.service;

import com.shopcart.model.Category;
import com.shopcart.model.Review;
import com.shopcart.model.CouponType;
import com.shopcart.model.Product;
import com.shopcart.model.Role;
import com.shopcart.model.User;
import com.shopcart.repo.CategoryRepository;
import com.shopcart.repo.ProductRepository;
import com.shopcart.repo.ReviewRepository;
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

    /** Bump the catalogue whenever the seeded rows change shape; a mismatch triggers a reseed. */
    private static final String SEED_MARKER = "Pome Book Air 13 (M2)";

    private final CategoryRepository categories;
    private final ProductRepository products;
    private final UserRepository users;
    private final ReviewRepository reviews;
    private final AdminService adminService;
    private final PasswordEncoder passwordEncoder;

    public DataSeeder(CategoryRepository categories, ProductRepository products, UserRepository users,
                      ReviewRepository reviews, AdminService adminService, PasswordEncoder passwordEncoder) {
        this.categories = categories;
        this.products = products;
        this.users = users;
        this.reviews = reviews;
        this.adminService = adminService;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void afterSingletonsInstantiated() {
        seedUsers();
        seedCatalogue();
        seedReviews();
        adminService.seedCoupon("WELCOME10", CouponType.PERCENT, new BigDecimal("10"), new BigDecimal("0"));
        adminService.seedCoupon("FLAT100", CouponType.FLAT, new BigDecimal("100"), new BigDecimal("999"));
        log.info("Seed data ready. Admin: admin@shopcart.in / Admin@123 | Customer: tharun@example.com / Passw0rd");
    }

    /** A handful of written reviews per product; the card still shows the lifetime rating count. */
    private void seedReviews() {
        if (reviews.count() > 0) {
            return;
        }
        String[][] authors = {
                {"Aarav Menon", "Ananya Iyer"}, {"Rohit Sharma", "Meera Nair"},
                {"Kabir Rao", "Divya Pillai"}, {"Ishaan Gupta", "Sneha Kulkarni"},
        };
        String[] titles = {"Exactly what I hoped for", "Worth the price", "Solid, with one niggle", "Bought a second one"};
        String[] bodies = {
                "Arrived a day early and the packaging was immaculate. Build quality feels a step above what I expected at this price.",
                "Been using it daily for three weeks now. No complaints at all, and it looks better in person than in the photos.",
                "Does the job well. Docked one star because the manual is thin, but the product itself is great.",
                "Second purchase from ShopCart and the experience was just as smooth. Delivery was quick and the item was sealed.",
        };
        int index = 0;
        for (Product product : products.findAll()) {
            int base = (int) Math.round(product.getRating());
            for (int i = 0; i < 3; i++) {
                Review review = new Review();
                review.setProductId(product.getId());
                review.setAuthorName(authors[index % authors.length][i % 2]);
                review.setRating(Math.max(3, Math.min(5, base + (i == 2 ? -1 : 0))));
                review.setTitle(titles[(index + i) % titles.length]);
                review.setBody(bodies[(index + i) % bodies.length]);
                reviews.save(review);
                index++;
            }
        }
        log.info("Seeded written reviews for {} products", products.count());
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
                && products.findAll().stream().anyMatch(p -> SEED_MARKER.equals(p.getName()));
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
                product("Pome Book Air 13 (M2)", "Pome",
                        "13.6-inch display, 8-core chip, 18-hour battery, fanless aluminium body, 1.24 kg.",
                        "99900.00", "114900.00", 8, electronics, "laptop", 4.7, 1890),
                product("Pome Phone 13", "Pome",
                        "6.1-inch OLED, dual 12MP cameras, ceramic-shield front, 5G, IP68.",
                        "69900.00", "79900.00", 14, electronics, "phone", 4.6, 4210),
                product("Pome Watch SE 40mm", "Pome",
                        "Aluminium case, always-on display, ECG and sleep tracking, 18-hour battery.",
                        "27900.00", "29900.00", 18, electronics, "watch", 4.7, 2140),
                product("Boze QC-45 Headphones", "Boze",
                        "Adaptive noise cancelling, 40 hours playback, USB-C fast charge, fold-flat case.",
                        "24990.00", "29990.00", 12, electronics, "headphones", 4.6, 1284),
                product("Pome 20W USB-C Adapter", "Pome",
                        "Compact travel adapter with a USB-C port, over-current protection, 20W output.",
                        "3499.00", "4499.00", 4, electronics, "charger", 4.4, 512),
                product("Keytron K8 TKL Keyboard", "Keytron",
                        "Hot-swappable brown switches, double-shot PBT caps, wired and Bluetooth.",
                        "6499.00", "7999.00", 8, electronics, "keyboard", 4.5, 738),
                product("Campuz Radiant Running Shoes", "Campuz",
                        "Responsive foam midsole, engineered mesh upper, 8mm drop, weighs 241g.",
                        "8999.00", "11999.00", 22, fashion, "sneakers", 4.3, 1904),
                product("Uniclo Pique Polo", "Uniclo",
                        "Cotton pique, ribbed collar, boxy fit, pre-shrunk, unisex sizing.",
                        "1299.00", "1799.00", 40, fashion, "tshirt", 4.1, 3120),
                product("Levy's 511 Slim Jeans", "Levy's",
                        "Stretch cotton denim, slim through the leg, five-pocket styling.",
                        "3299.00", "4599.00", 30, fashion, "jeans", 4.2, 861),
                product("Miltun Thermosteel Flask 1L", "Miltun",
                        "Double-walled vacuum steel, 24 hours cold and 12 hours hot, leak-proof lid.",
                        "1299.00", "1799.00", 25, home, "bottle", 4.5, 2670),
                product("Rubbermade Storage Container Set", "Rubbermade",
                        "Glass containers with clip lids, oven and freezer safe, stackable, set of five.",
                        "1499.00", "2199.00", 3, home, "containers", 4.0, 402),
                product("Prestigio Cast Iron Skillet 10in", "Prestigio",
                        "Pre-seasoned, oven safe to 260C, restaurant-grade iron, stay-cool handle.",
                        "2499.00", "3199.00", 10, home, "skillet", 4.6, 588),
                product("Designing Data-Heavy Systems", "O'Reily",
                        "Martin Kleppman. The ideas behind reliable, scalable and maintainable systems.",
                        "1799.00", "2250.00", 15, books, "books", 4.8, 1320),
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
