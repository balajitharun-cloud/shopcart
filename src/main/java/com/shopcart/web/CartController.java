package com.shopcart.web;

import com.shopcart.config.AuthContext;
import com.shopcart.dto.Dtos;
import com.shopcart.model.User;
import com.shopcart.service.CartService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Algorithms D, E and F endpoints. */
@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    /** Algorithm E - the cart plus the full bill (Algorithm F). */
    @GetMapping
    public Dtos.BillView view() {
        return cartService.view(AuthContext.require().getId());
    }

    /** Algorithm F step 6 - preview the bill with a coupon applied. */
    @PostMapping("/quote")
    public Dtos.BillView quote(@RequestBody Dtos.CouponRequest request) {
        return cartService.viewWithCoupon(AuthContext.require().getId(), request.couponCode());
    }

    /** Algorithm D - add to cart. */
    @PostMapping("/items")
    public Dtos.MessageResponse add(@RequestBody Dtos.CartItemRequest request) {
        User user = AuthContext.require();
        return cartService.add(user.getId(), request.productId(), request.quantity());
    }

    /** Algorithm E step 5a. */
    @PatchMapping("/items/{productId}")
    public Dtos.MessageResponse update(@PathVariable Long productId, @RequestBody Dtos.QuantityRequest request) {
        return cartService.updateQuantity(AuthContext.require().getId(), productId, request.quantity());
    }

    /** Algorithm E step 5b. */
    @DeleteMapping("/items/{productId}")
    public Dtos.MessageResponse remove(@PathVariable Long productId) {
        return cartService.remove(AuthContext.require().getId(), productId);
    }

    @DeleteMapping
    public Dtos.MessageResponse clear() {
        cartService.clear(AuthContext.require().getId());
        return new Dtos.MessageResponse("Cart cleared");
    }
}
