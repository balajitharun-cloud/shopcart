package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.dto.Dtos;
import com.shopcart.model.Product;
import com.shopcart.model.WishlistItem;
import com.shopcart.repo.ProductRepository;
import com.shopcart.repo.WishlistRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** Saved for later. */
@Service
public class WishlistService {

    private final WishlistRepository wishlist;
    private final ProductRepository products;
    private final CatalogService catalog;

    public WishlistService(WishlistRepository wishlist, ProductRepository products, CatalogService catalog) {
        this.wishlist = wishlist;
        this.products = products;
        this.catalog = catalog;
    }

    @Transactional(readOnly = true)
    public List<Dtos.ProductView> list(Long userId) {
        return wishlist.findByUserIdOrderByAddedAtDesc(userId).stream()
                .map(item -> products.findById(item.getProductId()))
                .flatMap(java.util.Optional::stream)
                .filter(Product::isActive)
                .map(catalog::toView)
                .toList();
    }

    @Transactional
    public Dtos.MessageResponse add(Long userId, Long productId) {
        products.findById(productId).filter(Product::isActive)
                .orElseThrow(() -> new AppException(404, "Product not found"));
        if (wishlist.findByUserIdAndProductId(userId, productId).isEmpty()) {
            WishlistItem item = new WishlistItem();
            item.setUserId(userId);
            item.setProductId(productId);
            wishlist.save(item);
        }
        return new Dtos.MessageResponse("Saved to your wishlist");
    }

    @Transactional
    public Dtos.MessageResponse remove(Long userId, Long productId) {
        wishlist.findByUserIdAndProductId(userId, productId).ifPresent(wishlist::delete);
        return new Dtos.MessageResponse("Removed from your wishlist");
    }
}
