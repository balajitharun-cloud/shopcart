package com.shopcart.web;

import com.shopcart.config.AuthContext;
import com.shopcart.dto.Dtos;
import com.shopcart.model.User;
import com.shopcart.service.ReviewService;
import com.shopcart.service.WishlistService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Reviews (public to read) and the wishlist (per account). */
@RestController
@RequestMapping("/api")
public class EngagementController {

    private final ReviewService reviewService;
    private final WishlistService wishlistService;

    public EngagementController(ReviewService reviewService, WishlistService wishlistService) {
        this.reviewService = reviewService;
        this.wishlistService = wishlistService;
    }

    @GetMapping("/catalog/products/{productId}/reviews")
    public Dtos.ReviewSummary reviews(@PathVariable Long productId) {
        return reviewService.summary(productId);
    }

    @PostMapping("/products/{productId}/reviews")
    public Dtos.ReviewSummary addReview(@PathVariable Long productId,
                                        @Valid @RequestBody Dtos.ReviewRequest request) {
        return reviewService.add(AuthContext.require(), productId, request);
    }

    @GetMapping("/wishlist")
    public List<Dtos.ProductView> wishlist() {
        return wishlistService.list(AuthContext.require().getId());
    }

    @PostMapping("/wishlist/{productId}")
    public Dtos.MessageResponse save(@PathVariable Long productId) {
        User user = AuthContext.require();
        return wishlistService.add(user.getId(), productId);
    }

    @DeleteMapping("/wishlist/{productId}")
    public Dtos.MessageResponse unsave(@PathVariable Long productId) {
        return wishlistService.remove(AuthContext.require().getId(), productId);
    }
}
