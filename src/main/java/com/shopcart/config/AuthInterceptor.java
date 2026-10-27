package com.shopcart.config;

import com.shopcart.model.User;
import com.shopcart.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** Validates the Bearer session token on every protected API call. */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final AuthService authService;

    public AuthInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // Browser CORS preflight never carries the token; the CORS filter answers it.
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw new AppException(401, "Please log in to continue");
        }
        User user = authService.resolveSession(header.substring(7).trim());
        if (user == null) {
            throw new AppException(401, "Session expired, please log in again");
        }
        AuthContext.set(user);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        AuthContext.clear();
    }
}
