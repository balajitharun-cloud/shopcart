package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.dto.Dtos;
import com.shopcart.model.Category;
import com.shopcart.model.Coupon;
import com.shopcart.model.CouponType;
import com.shopcart.model.Order;
import com.shopcart.model.OrderStatus;
import com.shopcart.model.Product;
import com.shopcart.repo.CategoryRepository;
import com.shopcart.repo.CouponRepository;
import com.shopcart.repo.ProductRepository;
import com.shopcart.repo.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;

/** Algorithm I - admin dashboard operations (product CRUD and reports). */
@Service
public class AdminService {

    private static final int LOW_STOCK_THRESHOLD = 5;

    private final ProductRepository products;
    private final CategoryRepository categories;
    private final CouponRepository coupons;
    private final UserRepository users;
    private final OrderService orderService;
    private final CatalogService catalog;

    public AdminService(ProductRepository products, CategoryRepository categories, CouponRepository coupons,
                        UserRepository users, OrderService orderService, CatalogService catalog) {
        this.products = products;
        this.categories = categories;
        this.coupons = coupons;
        this.users = users;
        this.orderService = orderService;
        this.catalog = catalog;
    }

    /** Step 5a - add product. */
    @Transactional
    public Dtos.ProductView create(Dtos.ProductRequest request) {
        Product product = new Product();
        apply(product, request);
        products.save(product);
        return catalog.toView(product);
    }

    /** Step 5b - update product. */
    @Transactional
    public Dtos.ProductView update(Long id, Dtos.ProductRequest request) {
        Product product = products.findById(id)
                .orElseThrow(() -> new AppException(404, "Product not found"));
        apply(product, request);
        products.save(product);
        return catalog.toView(product);
    }

    /** Step 5c - delete product (soft delete so past orders keep their history). */
    @Transactional
    public Dtos.MessageResponse delete(Long id) {
        Product product = products.findById(id)
                .orElseThrow(() -> new AppException(404, "Product not found"));
        product.setActive(false);
        products.save(product);
        return new Dtos.MessageResponse(product.getName() + " removed from the catalogue");
    }

    public List<Dtos.ProductView> allProducts() {
        return products.findAll().stream()
                .sorted(Comparator.comparing(Product::getId))
                .map(catalog::toView)
                .toList();
    }

    public List<Dtos.CategoryView> categories() {
        return catalog.categories();
    }

    /** Step 5e - sales / stock / user report. */
    @Transactional(readOnly = true)
    public Dtos.ReportView report() {
        List<Order> orders = orderService.allOrders();
        BigDecimal revenue = orders.stream()
                .filter(o -> o.getStatus() != OrderStatus.CANCELLED)
                .map(Order::getGrandTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<Dtos.ProductView> lowStock = products
                .findByStockLessThanEqualAndActiveTrueOrderByStockAsc(LOW_STOCK_THRESHOLD)
                .stream()
                .map(catalog::toView)
                .toList();

        return new Dtos.ReportView(
                orders.size(),
                revenue,
                orderService.countByStatus(OrderStatus.PLACED),
                orderService.countByStatus(OrderStatus.PROCESSING),
                orderService.countByStatus(OrderStatus.SHIPPED),
                orderService.countByStatus(OrderStatus.OUT_FOR_DELIVERY),
                orderService.countByStatus(OrderStatus.DELIVERED),
                orderService.countByStatus(OrderStatus.CANCELLED),
                products.count(),
                lowStock.size(),
                users.count(),
                lowStock,
                orderService.listAll().stream().limit(8).toList());
    }

    private void apply(Product product, Dtos.ProductRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new AppException(400, "Product name is required");
        }
        if (request.price() == null || request.price().compareTo(BigDecimal.ZERO) < 0) {
            throw new AppException(400, "Price must be zero or more");
        }
        if (request.stock() == null || request.stock() < 0) {
            throw new AppException(400, "Stock must be zero or more");
        }
        product.setName(request.name().trim());
        product.setBrand(request.brand() == null || request.brand().isBlank()
                ? "ShopCart" : request.brand().trim());
        product.setDescription(request.description() == null ? "" : request.description().trim());
        product.setPrice(request.price().setScale(2, java.math.RoundingMode.HALF_UP));
        product.setMrp(request.mrp() == null || request.mrp().compareTo(request.price()) < 0
                ? request.price().setScale(2, java.math.RoundingMode.HALF_UP)
                : request.mrp().setScale(2, java.math.RoundingMode.HALF_UP));
        product.setStock(request.stock());
        product.setImage(request.image() == null || request.image().isBlank() ? "package" : request.image());
        product.setActive(request.active() == null || request.active());
        product.setRating(request.rating() == null ? 0d : Math.max(0d, Math.min(5d, request.rating())));
        product.setReviewCount(request.reviewCount() == null ? 0 : Math.max(0, request.reviewCount()));
        if (request.categoryId() != null) {
            Category category = categories.findById(request.categoryId())
                    .orElseThrow(() -> new AppException(400, "Category not found"));
            product.setCategory(category);
        }
    }

    /** Convenience for the seeder so demo data can also create coupons. */
    @Transactional
    public Coupon seedCoupon(String code, CouponType type, BigDecimal value, BigDecimal minSubtotal) {
        return coupons.findByCodeIgnoreCaseAndActiveTrue(code).orElseGet(() -> {
            Coupon coupon = new Coupon();
            coupon.setCode(code);
            coupon.setType(type);
            coupon.setValue(value);
            coupon.setMinSubtotal(minSubtotal);
            coupon.setActive(true);
            return coupons.save(coupon);
        });
    }
}
