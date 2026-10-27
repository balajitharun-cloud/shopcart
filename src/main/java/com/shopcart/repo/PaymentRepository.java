package com.shopcart.repo;

import com.shopcart.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    List<Payment> findByOrderId(Long orderId);
    void deleteByOrderIdIn(Collection<Long> orderIds);
}
