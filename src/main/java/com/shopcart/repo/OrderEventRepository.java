package com.shopcart.repo;

import com.shopcart.model.OrderEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface OrderEventRepository extends JpaRepository<OrderEvent, Long> {
    List<OrderEvent> findByOrderIdOrderByCreatedAtAsc(Long orderId);
    void deleteByOrderIdIn(Collection<Long> orderIds);
}
