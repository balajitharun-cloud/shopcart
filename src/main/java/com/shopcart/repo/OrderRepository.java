package com.shopcart.repo;

import com.shopcart.model.Order;
import com.shopcart.model.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<Order> findByUserId(Long userId);
    Optional<Order> findByOrderCode(String orderCode);
    List<Order> findAllByOrderByCreatedAtDesc();
    long countByStatus(OrderStatus status);
    boolean existsByOrderCode(String orderCode);
}
