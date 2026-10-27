package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.dto.Dtos;
import com.shopcart.model.CartItem;
import com.shopcart.model.Order;
import com.shopcart.model.OrderEvent;
import com.shopcart.model.OrderItem;
import com.shopcart.model.OrderStatus;
import com.shopcart.model.Payment;
import com.shopcart.model.PaymentMethod;
import com.shopcart.model.PaymentStatus;
import com.shopcart.model.Product;
import com.shopcart.model.Role;
import com.shopcart.model.User;
import com.shopcart.repo.CartItemRepository;
import com.shopcart.repo.OrderEventRepository;
import com.shopcart.repo.OrderRepository;
import com.shopcart.repo.PaymentRepository;
import com.shopcart.repo.ProductRepository;
import com.shopcart.repo.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Algorithm A steps 15-27 (checkout, order saving, stock, confirmation) and Algorithm H (tracking). */
@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final OrderRepository orders;
    private final OrderEventRepository events;
    private final PaymentRepository payments;
    private final ProductRepository products;
    private final CartItemRepository cartItems;
    private final UserRepository users;
    private final PricingService pricing;
    private final PaymentService paymentService;
    private final NotificationService notifications;

    public OrderService(OrderRepository orders, OrderEventRepository events, PaymentRepository payments,
                        ProductRepository products, CartItemRepository cartItems, UserRepository users,
                        PricingService pricing, PaymentService paymentService, NotificationService notifications) {
        this.orders = orders;
        this.events = events;
        this.payments = payments;
        this.products = products;
        this.cartItems = cartItems;
        this.users = users;
        this.pricing = pricing;
        this.paymentService = paymentService;
        this.notifications = notifications;
    }

    /** Steps 17-26: price the cart, take payment, save the order, cut stock, clear the cart, confirm. */
    @Transactional
    public Dtos.OrderView checkout(User user, Dtos.CheckoutRequest request) {
        // Step 16 - the bill is recomputed on the server; the browser figure is never trusted.
        Dtos.BillView bill = pricing.quote(user.getId(), request.couponCode());
        if (bill.lines().isEmpty()) {
            throw new AppException(400, "Your cart is empty");
        }

        PaymentMethod method = parseMethod(request.paymentMethod());

        // Step 12/24 - lock the rows and re-check stock before charging anyone.
        List<Product> lockedProducts = new ArrayList<>();
        for (Dtos.CartLine line : bill.lines()) {
            Product product = products.lockById(line.productId())
                    .orElseThrow(() -> new AppException(404, "Product no longer available: " + line.name()));
            if (product.getStock() < line.quantity()) {
                throw new AppException(409, "Only " + product.getStock() + " unit(s) of " + product.getName()
                        + " left. Please update your cart and try again.");
            }
            lockedProducts.add(product);
        }

        // Step 20 - process the payment; Step 21 - a failure sends the user back to step 19.
        PaymentService.PaymentResult result =
                paymentService.charge(method, bill.grandTotal(), request.paymentDetail());
        if (!result.success()) {
            throw new AppException(402, result.message());
        }

        // Step 22 - unique order id.
        Order order = new Order();
        order.setOrderCode(nextOrderCode());
        order.setUserId(user.getId());
        order.setSubtotal(bill.subtotal());
        order.setTax(bill.tax());
        order.setShipping(bill.shipping());
        order.setDiscount(bill.discount());
        order.setGrandTotal(bill.grandTotal());
        order.setCouponCode(bill.couponCode());
        order.setStatus(OrderStatus.PLACED);
        order.setPaymentMethod(method);
        order.setPaymentStatus(result.status());
        order.setShippingAddress(request.shippingAddress().trim());
        order.setCreatedAt(LocalDateTime.now());
        order.setUpdatedAt(LocalDateTime.now());

        // Step 23 - order items snapshot name and price.
        for (Dtos.CartLine line : bill.lines()) {
            OrderItem item = new OrderItem();
            item.setProductId(line.productId());
            item.setProductName(line.name());
            item.setImage(line.image());
            item.setUnitPrice(line.price());
            item.setQuantity(line.quantity());
            item.setLineTotal(line.subtotal());
            order.addItem(item);
        }
        orders.save(order);

        // Step 24 - new_stock = old_stock - quantity.
        for (int i = 0; i < bill.lines().size(); i++) {
            Product product = lockedProducts.get(i);
            product.setStock(product.getStock() - bill.lines().get(i).quantity());
            products.save(product);
        }

        // Algorithm G step 8 - payments table.
        Payment payment = new Payment();
        payment.setOrderId(order.getId());
        payment.setMethod(method);
        payment.setStatus(result.status());
        payment.setAmount(bill.grandTotal());
        payment.setReference(result.reference());
        payment.setInstrumentMasked(result.maskedInstrument());
        payment.setCreatedAt(LocalDateTime.now());
        payments.save(payment);

        events.save(new OrderEvent(order.getId(), OrderStatus.PLACED));

        // Step 25 - clear the cart.
        cartItems.deleteByUserId(user.getId());

        // Step 26 - confirmation + Email/SMS.
        String notified = notifications.sendOrderConfirmation(user, order);
        log.info("Order {} placed by user {} - {} ({})", order.getOrderCode(), user.getId(),
                bill.grandTotal(), notified);

        return toView(order, user);
    }

    @Transactional(readOnly = true)
    public List<Dtos.OrderView> listForUser(User user) {
        return orders.findByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(o -> toView(o, user))
                .toList();
    }

    /** Algorithm H step 2/3 - fetch by order id, restricted to the owner unless admin. */
    @Transactional(readOnly = true)
    public Dtos.OrderView get(User actor, String orderCode) {
        Order order = orders.findByOrderCode(orderCode)
                .orElseThrow(() -> new AppException(404, "Order not found"));
        if (actor.getRole() != Role.ADMIN && !order.getUserId().equals(actor.getId())) {
            throw new AppException(403, "This order belongs to another account");
        }
        User owner = users.findById(order.getUserId()).orElse(actor);
        return toView(order, owner);
    }

    /** Algorithm H step 5 - cancel while Placed/Processing and put the stock back. */
    @Transactional
    public Dtos.OrderView cancel(User actor, String orderCode) {
        Order order = orders.findByOrderCode(orderCode)
                .orElseThrow(() -> new AppException(404, "Order not found"));
        if (actor.getRole() != Role.ADMIN && !order.getUserId().equals(actor.getId())) {
            throw new AppException(403, "This order belongs to another account");
        }
        if (!order.getStatus().isCancellable()) {
            throw new AppException(409, "Order is already " + label(order.getStatus())
                    + " and can no longer be cancelled.");
        }
        for (OrderItem item : order.getItems()) {
            products.lockById(item.getProductId()).ifPresent(product -> {
                product.setStock(product.getStock() + item.getQuantity());
                products.save(product);
            });
        }
        applyStatus(order, OrderStatus.CANCELLED);
        User owner = users.findById(order.getUserId()).orElse(actor);
        notifications.sendStatusUpdate(owner, order);
        return toView(order, owner);
    }

    /** Algorithm I step 5d - admin moves the order along the tracking timeline. */
    @Transactional
    public Dtos.OrderView updateStatus(String orderCode, String statusText) {
        Order order = orders.findByOrderCode(orderCode)
                .orElseThrow(() -> new AppException(404, "Order not found"));
        OrderStatus next;
        try {
            next = OrderStatus.valueOf(statusText.trim().toUpperCase(Locale.ROOT).replace(' ', '_'));
        } catch (IllegalArgumentException ex) {
            throw new AppException(400, "Unknown order status: " + statusText);
        }
        if (next == OrderStatus.CANCELLED) {
            return cancel(adminActor(), orderCode);
        }
        if (!order.getStatus().canTransitionTo(next)) {
            throw new AppException(409, "Cannot move an order from " + label(order.getStatus())
                    + " to " + label(next));
        }
        applyStatus(order, next);
        User owner = users.findById(order.getUserId()).orElse(null);
        if (owner != null) {
            notifications.sendStatusUpdate(owner, order);
        }
        return toView(order, owner);
    }

    @Transactional(readOnly = true)
    public List<Dtos.OrderView> listAll() {
        return orders.findAllByOrderByCreatedAtDesc().stream()
                .map(o -> toView(o, users.findById(o.getUserId()).orElse(null)))
                .toList();
    }

    public List<Order> allOrders() {
        return orders.findAllByOrderByCreatedAtDesc();
    }

    public long countByStatus(OrderStatus status) {
        return orders.countByStatus(status);
    }

    private void applyStatus(Order order, OrderStatus status) {
        order.setStatus(status);
        order.setUpdatedAt(LocalDateTime.now());
        orders.save(order);
        events.save(new OrderEvent(order.getId(), status));
    }

    private User adminActor() {
        User actor = new User();
        actor.setRole(Role.ADMIN);
        return actor;
    }

    private PaymentMethod parseMethod(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new AppException(400, "Please select a payment method");
        }
        String normalised = raw.trim().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        try {
            return PaymentMethod.valueOf(normalised);
        } catch (IllegalArgumentException ex) {
            throw new AppException(400, "Unsupported payment method: " + raw);
        }
    }

    private String nextOrderCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder("ORD-");
            sb.append(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyMMdd"))).append('-');
            for (int i = 0; i < 5; i++) {
                sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
            }
            String code = sb.toString();
            if (!orders.existsByOrderCode(code)) {
                return code;
            }
        }
        throw new AppException(500, "Could not generate an order id, please retry");
    }

    public Dtos.OrderView toView(Order order, User owner) {
        List<Dtos.OrderItemView> items = order.getItems().stream()
                .map(i -> new Dtos.OrderItemView(i.getProductId(), i.getProductName(), i.getImage(),
                        i.getUnitPrice(), i.getQuantity(), i.getLineTotal()))
                .toList();

        List<Dtos.OrderEventView> timeline = events.findByOrderIdOrderByCreatedAtAsc(order.getId()).stream()
                .map(e -> new Dtos.OrderEventView(e.getStatus().name(), e.getCreatedAt().format(STAMP)))
                .toList();

        String paymentRef = payments.findByOrderId(order.getId()).stream()
                .findFirst()
                .map(Payment::getReference)
                .orElse(null);

        return new Dtos.OrderView(
                order.getOrderCode(),
                order.getStatus().name(),
                label(order.getStatus()),
                order.getStatus().isCancellable(),
                order.getPaymentMethod().name(),
                order.getPaymentStatus().name(),
                paymentRef,
                order.getSubtotal(), order.getTax(), order.getShipping(), order.getDiscount(),
                order.getGrandTotal(), order.getCouponCode(), order.getShippingAddress(),
                order.getCreatedAt().format(STAMP),
                owner == null ? "Customer" : owner.getName(),
                owner == null ? "" : owner.getEmail(),
                items, timeline);
    }

    public static String label(OrderStatus status) {
        return switch (status) {
            case PLACED -> "Placed";
            case PROCESSING -> "Processing";
            case SHIPPED -> "Shipped";
            case OUT_FOR_DELIVERY -> "Out for Delivery";
            case DELIVERED -> "Delivered";
            case CANCELLED -> "Cancelled";
        };
    }

    /** Unused helper kept for readability of the cart-clearing contract. */
    @SuppressWarnings("unused")
    private List<CartItem> cartOf(Long userId) {
        return cartItems.findByUserIdOrderByAddedAtAsc(userId);
    }
}
