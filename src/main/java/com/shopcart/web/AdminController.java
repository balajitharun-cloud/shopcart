package com.shopcart.web;

import com.shopcart.config.AuthContext;
import com.shopcart.dto.Dtos;
import com.shopcart.service.AdminService;
import com.shopcart.service.OrderService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Algorithm I - admin dashboard endpoints. Every method checks the ADMIN role. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;
    private final OrderService orderService;

    public AdminController(AdminService adminService, OrderService orderService) {
        this.adminService = adminService;
        this.orderService = orderService;
    }

    @GetMapping("/products")
    public List<Dtos.ProductView> products() {
        AuthContext.requireAdmin();
        return adminService.allProducts();
    }

    @PostMapping("/products")
    public Dtos.ProductView createProduct(@RequestBody Dtos.ProductRequest request) {
        AuthContext.requireAdmin();
        return adminService.create(request);
    }

    @PutMapping("/products/{id}")
    public Dtos.ProductView updateProduct(@PathVariable Long id, @RequestBody Dtos.ProductRequest request) {
        AuthContext.requireAdmin();
        return adminService.update(id, request);
    }

    @DeleteMapping("/products/{id}")
    public Dtos.MessageResponse deleteProduct(@PathVariable Long id) {
        AuthContext.requireAdmin();
        return adminService.delete(id);
    }

    @GetMapping("/orders")
    public List<Dtos.OrderView> orders() {
        AuthContext.requireAdmin();
        return orderService.listAll();
    }

    @PatchMapping("/orders/{orderCode}/status")
    public Dtos.OrderView updateStatus(@PathVariable String orderCode, @RequestBody Dtos.StatusRequest request) {
        AuthContext.requireAdmin();
        return orderService.updateStatus(orderCode, request.status());
    }

    @GetMapping("/reports")
    public Dtos.ReportView reports() {
        AuthContext.requireAdmin();
        return adminService.report();
    }

    @GetMapping("/categories")
    public List<Dtos.CategoryView> categories() {
        AuthContext.requireAdmin();
        return adminService.categories();
    }
}
