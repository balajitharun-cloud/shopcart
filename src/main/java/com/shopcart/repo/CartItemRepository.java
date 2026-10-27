package com.shopcart.repo;

import com.shopcart.model.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CartItemRepository extends JpaRepository<CartItem, Long> {
    List<CartItem> findByUserIdOrderByAddedAtAsc(Long userId);
    Optional<CartItem> findByUserIdAndProductId(Long userId, Long productId);
    long deleteByUserId(Long userId);
    long countByUserId(Long userId);
}
