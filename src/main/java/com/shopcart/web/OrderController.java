package com.shopcart.web;

import com.shopcart.config.AuthContext;
import com.shopcart.dto.Dtos;
import com.shopcart.model.User;
import com.shopcart.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Algorithm A steps 17-27 (checkout, confirmation) and Algorithm H (tracking, cancel). */
@RestController
@RequestMapping("/api")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/checkout")
    public Dtos.OrderView checkout(@Valid @RequestBody Dtos.CheckoutRequest request) {
        User user = AuthContext.require();
        return orderService.checkout(user, request);
    }

    @GetMapping("/orders")
    public List<Dtos.OrderView> myOrders() {
        return orderService.listForUser(AuthContext.require());
    }

    @GetMapping("/orders/{orderCode}")
    public Dtos.OrderView order(@PathVariable String orderCode) {
        return orderService.get(AuthContext.require(), orderCode);
    }

    @PostMapping("/orders/{orderCode}/cancel")
    public Dtos.OrderView cancel(@PathVariable String orderCode) {
        return orderService.cancel(AuthContext.require(), orderCode);
    }
}
