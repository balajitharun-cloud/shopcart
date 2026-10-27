package com.shopcart.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/** All request/response payloads used by the REST API. */
public final class Dtos {

    private Dtos() { }

    // ---------- auth (Algorithms B and C) ----------

    public record RegisterRequest(
            @NotBlank(message = "is required") String name,
            @NotBlank(message = "is required") @Email(message = "must be a valid email") String email,
            @NotBlank(message = "is required") String phone,
            @NotBlank(message = "is required") @Size(min = 6, message = "must be at least 6 characters") String password,
            @NotBlank(message = "is required") String address) { }

    public record LoginRequest(
            @NotBlank(message = "is required") String email,
            @NotBlank(message = "is required") String password) { }

    public record UserView(Long id, String name, String email, String phone, String address, String role) { }

    public record AuthResponse(String token, UserView user) { }

    // ---------- catalog ----------

    public record CategoryView(Long id, String name, String slug) { }

    public record ProductView(Long id, String name, String brand, String description, BigDecimal price,
                              BigDecimal mrp, int stock, String category, String image, boolean active,
                              double rating, int reviewCount) { }

    public record ProductRequest(String name, String brand, String description, BigDecimal price,
                                 BigDecimal mrp, Integer stock, Long categoryId, String image,
                                 Boolean active, Double rating, Integer reviewCount) { }

    // ---------- cart and billing (Algorithms D, E, F) ----------

    public record CartItemRequest(Long productId, Integer quantity) { }

    public record QuantityRequest(Integer quantity) { }

    public record CouponRequest(String couponCode) { }

    public record CartLine(Long productId, String name, String brand, String image, BigDecimal price,
                           int quantity, int stock, BigDecimal subtotal) { }

    public record BillView(List<CartLine> lines, int itemCount, BigDecimal subtotal, BigDecimal tax,
                           BigDecimal shipping, BigDecimal discount, BigDecimal grandTotal,
                           String couponCode, String couponMessage, BigDecimal freeShippingGap,
                           BigDecimal taxRate, BigDecimal freeShippingLimit) { }

    // ---------- checkout and orders (Algorithms A, G, H) ----------

    public record CheckoutRequest(@NotBlank(message = "is required") String shippingAddress,
                                  @NotBlank(message = "is required") String paymentMethod,
                                  String paymentDetail,
                                  String couponCode) { }

    public record OrderItemView(Long productId, String name, String image, BigDecimal unitPrice,
                                int quantity, BigDecimal lineTotal) { }

    public record OrderEventView(String status, String at) { }

    public record OrderView(String orderCode, String status, String statusLabel, boolean cancellable,
                            String paymentMethod, String paymentStatus, String paymentReference,
                            BigDecimal subtotal, BigDecimal tax, BigDecimal shipping, BigDecimal discount,
                            BigDecimal grandTotal, String couponCode, String shippingAddress,
                            String createdAt, String customerName, String customerEmail,
                            List<OrderItemView> items, List<OrderEventView> events) { }

    public record StatusRequest(@NotBlank(message = "is required") String status) { }

    // ---------- admin ----------

    public record ReportView(long totalOrders, BigDecimal revenue, long placed, long processing,
                             long shipped, long outForDelivery, long delivered, long cancelled,
                             long products, long lowStock, long customers,
                             List<ProductView> lowStockProducts, List<OrderView> recentOrders) { }

    public record MessageResponse(String message) { }

    // ---------- reviews and wishlist ----------

    public record ReviewView(Long id, String author, int rating, String title, String body, String createdAt) { }

    public record ReviewSummary(double average, long count, int[] distribution, List<ReviewView> reviews) { }

    public record ReviewRequest(Integer rating, String title, String body) { }

    public record DeleteAccountRequest(@NotBlank(message = "is required") String password) { }
}
