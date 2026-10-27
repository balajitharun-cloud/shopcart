package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.dto.Dtos;
import com.shopcart.model.Order;
import com.shopcart.model.Role;
import com.shopcart.model.SessionToken;
import com.shopcart.model.User;
import com.shopcart.repo.CartItemRepository;
import com.shopcart.repo.OrderEventRepository;
import com.shopcart.repo.OrderRepository;
import com.shopcart.repo.PaymentRepository;
import com.shopcart.repo.SessionTokenRepository;
import com.shopcart.repo.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;
import java.util.regex.Pattern;

/** Algorithm B (registration) and Algorithm C (login + session). */
@Service
public class AuthService {

    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");
    private static final Pattern PHONE_PATTERN = Pattern.compile("^[0-9+\\- ]{8,15}$");

    private final UserRepository users;
    private final SessionTokenRepository sessions;
    private final PasswordEncoder passwordEncoder;
    private final CartItemRepository cartItems;
    private final OrderRepository orders;
    private final OrderEventRepository orderEvents;
    private final PaymentRepository payments;

    @Value("${app.auth.max-login-attempts:3}")
    private int maxLoginAttempts;

    @Value("${app.auth.lock-minutes:15}")
    private int lockMinutes;

    @Value("${app.auth.session-hours:24}")
    private int sessionHours;

    public AuthService(UserRepository users, SessionTokenRepository sessions, PasswordEncoder passwordEncoder,
                       CartItemRepository cartItems, OrderRepository orders,
                       OrderEventRepository orderEvents, PaymentRepository payments) {
        this.users = users;
        this.sessions = sessions;
        this.passwordEncoder = passwordEncoder;
        this.cartItems = cartItems;
        this.orders = orders;
        this.orderEvents = orderEvents;
        this.payments = payments;
    }

    /** Algorithm B. */
    @Transactional
    public Dtos.MessageResponse register(Dtos.RegisterRequest request) {
        String name = trim(request.name());
        String email = trim(request.email()).toLowerCase();
        String phone = trim(request.phone());
        String address = trim(request.address());

        // Step 4 - all fields present and the email format is correct.
        if (name.isEmpty() || email.isEmpty() || phone.isEmpty() || address.isEmpty()) {
            throw new AppException(400, "All fields are required");
        }
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new AppException(400, "Please enter a valid email address");
        }
        if (!PHONE_PATTERN.matcher(phone).matches()) {
            throw new AppException(400, "Please enter a valid phone number");
        }
        if (request.password() == null || request.password().length() < 6) {
            throw new AppException(400, "Password must be at least 6 characters");
        }
        // Step 6 / 7 - duplicate email check.
        if (users.existsByEmailIgnoreCase(email)) {
            throw new AppException(409, "Email already registered. Please log in instead.");
        }

        User user = new User();
        user.setName(name);
        user.setEmail(email);
        user.setPhone(phone);
        user.setAddress(address);
        // Step 8 - hash the password before it ever touches the database.
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(Role.CUSTOMER);
        user.setCreatedAt(LocalDateTime.now());
        users.save(user); // Step 9

        return new Dtos.MessageResponse("Registration successful. Please log in."); // Step 10
    }

    /**
     * Algorithm C.
     *
     * <p>noRollbackFor is deliberate: a failed attempt must still be committed, otherwise
     * throwing the error would undo the attempt counter and the 3-strike lock would never fire.</p>
     */
    @Transactional(noRollbackFor = AppException.class)
    public Dtos.AuthResponse login(Dtos.LoginRequest request) {
        String email = trim(request.email()).toLowerCase();
        User user = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new AppException(401, "User not found with this email")); // Step 4

        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            long minutes = Math.max(1, java.time.Duration.between(LocalDateTime.now(), user.getLockedUntil()).toMinutes() + 1);
            throw new AppException(423, "Account locked after " + maxLoginAttempts
                    + " failed attempts. Try again in " + minutes + " minute(s).");
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) { // Step 5
            int attempts = user.getFailedAttempts() + 1;
            user.setFailedAttempts(attempts);
            if (attempts >= maxLoginAttempts) { // Step 6 - temporary lock
                user.setLockedUntil(LocalDateTime.now().plusMinutes(lockMinutes));
                user.setFailedAttempts(0);
                users.save(user);
                throw new AppException(423, "Account locked for " + lockMinutes
                        + " minutes after " + maxLoginAttempts + " failed attempts.");
            }
            users.save(user);
            throw new AppException(401, "Invalid password. Attempt " + attempts + " of " + maxLoginAttempts + ".");
        }

        user.setFailedAttempts(0);
        user.setLockedUntil(null);
        users.save(user);

        // Step 7 - create the user session.
        SessionToken token = new SessionToken();
        token.setToken(UUID.randomUUID().toString().replace("-", ""));
        token.setUserId(user.getId());
        token.setCreatedAt(LocalDateTime.now());
        token.setExpiresAt(LocalDateTime.now().plusHours(sessionHours));
        sessions.save(token);

        return new Dtos.AuthResponse(token.getToken(), toView(user)); // Step 8
    }

    /** Resolves a Bearer token to its user, or null when the session is gone/expired. */
    @Transactional
    public User resolveSession(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        return sessions.findByToken(token)
                .filter(s -> s.getExpiresAt().isAfter(LocalDateTime.now()))
                .flatMap(s -> users.findById(s.getUserId()))
                .orElse(null);
    }

    /**
     * Closes the account for good: cart, sessions, orders, payments and the user row.
     *
     * <p>The password is required again - deleting an account is irreversible and a borrowed
     * unlocked browser should not be enough. The last remaining admin cannot be removed, otherwise
     * nobody could administer the store.</p>
     */
    @Transactional
    public Dtos.MessageResponse deleteAccount(User user, String password) {
        if (password == null || !passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new AppException(403, "That password does not match. Account was not deleted.");
        }
        if (user.getRole() == Role.ADMIN
                && users.findAll().stream().filter(u -> u.getRole() == Role.ADMIN).count() <= 1) {
            throw new AppException(409, "This is the only admin account, so it cannot be deleted.");
        }

        java.util.List<Order> owned = orders.findByUserId(user.getId());
        java.util.List<Long> orderIds = owned.stream().map(Order::getId).toList();
        if (!orderIds.isEmpty()) {
            orderEvents.deleteByOrderIdIn(orderIds);
            payments.deleteByOrderIdIn(orderIds);
            orders.deleteAll(owned); // order items cascade with the order
        }
        cartItems.deleteByUserId(user.getId());
        sessions.deleteByUserId(user.getId());
        users.delete(user);

        return new Dtos.MessageResponse("Your account and its data have been deleted.");
    }

    @Transactional
    public void logout(String token) {
        if (token != null && !token.isBlank()) {
            sessions.deleteById(token);
        }
    }

    public Dtos.UserView toView(User user) {
        return new Dtos.UserView(user.getId(), user.getName(), user.getEmail(),
                user.getPhone(), user.getAddress(), user.getRole().name());
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
