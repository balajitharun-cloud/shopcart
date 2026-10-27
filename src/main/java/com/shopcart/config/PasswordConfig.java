package com.shopcart.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Kept separate from {@link WebConfig} on purpose: the auth interceptor depends on
 * AuthService, which needs the PasswordEncoder, so defining it here avoids a
 * configuration cycle between those beans.
 */
@Configuration
public class PasswordConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
