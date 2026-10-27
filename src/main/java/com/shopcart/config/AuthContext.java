package com.shopcart.config;

import com.shopcart.model.User;

/** Holds the authenticated user for the current request thread. */
public final class AuthContext {

    private static final ThreadLocal<User> CURRENT = new ThreadLocal<>();

    private AuthContext() { }

    public static void set(User user) {
        CURRENT.set(user);
    }

    public static User get() {
        return CURRENT.get();
    }

    public static User require() {
        User user = CURRENT.get();
        if (user == null) {
            throw new AppException(401, "Please log in to continue");
        }
        return user;
    }

    public static User requireAdmin() {
        User user = require();
        if (user.getRole() != com.shopcart.model.Role.ADMIN) {
            throw new AppException(403, "Admin access only");
        }
        return user;
    }

    public static void clear() {
        CURRENT.remove();
    }
}
