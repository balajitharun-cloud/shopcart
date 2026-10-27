package com.shopcart.repo;

import com.shopcart.model.SessionToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SessionTokenRepository extends JpaRepository<SessionToken, String> {
    Optional<SessionToken> findByToken(String token);
    void deleteByUserId(Long userId);
}
