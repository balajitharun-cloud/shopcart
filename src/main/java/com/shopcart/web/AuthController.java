package com.shopcart.web;

import com.shopcart.config.AuthContext;
import com.shopcart.dto.Dtos;
import com.shopcart.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Algorithm B and C endpoints. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public Dtos.MessageResponse register(@Valid @RequestBody Dtos.RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public Dtos.AuthResponse login(@Valid @RequestBody Dtos.LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/logout")
    public Dtos.MessageResponse logout(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        authService.logout(header == null ? null : header.replace("Bearer", "").trim());
        return new Dtos.MessageResponse("Logged out");
    }

    /** Account closure - password re-confirmed in the body. */
    @DeleteMapping("/account")
    public Dtos.MessageResponse deleteAccount(@Valid @RequestBody Dtos.DeleteAccountRequest request) {
        return authService.deleteAccount(AuthContext.require(), request.password());
    }

    @GetMapping("/me")
    public Dtos.UserView me() {
        return authService.toView(AuthContext.require());
    }
}
