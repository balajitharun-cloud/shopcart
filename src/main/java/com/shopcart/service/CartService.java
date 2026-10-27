package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.dto.Dtos;
import com.shopcart.model.CartItem;
import com.shopcart.model.Product;
import com.shopcart.repo.CartItemRepository;
import com.shopcart.repo.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Algorithm D (add to cart) and Algorithm E (view / update / remove). */
@Service
public class CartService {

    private final CartItemRepository cartItems;
    private final ProductRepository products;
    private final PricingService pricing;

    public CartService(CartItemRepository cartItems, ProductRepository products, PricingService pricing) {
        this.cartItems = cartItems;
        this.products = products;
        this.pricing = pricing;
    }

    public Dtos.BillView view(Long userId) {
        return pricing.quote(userId, null);
    }

    public Dtos.BillView viewWithCoupon(Long userId, String couponCode) {
        return pricing.quote(userId, couponCode);
    }

    /** Algorithm D - add a product to the cart. */
    @Transactional
    public Dtos.MessageResponse add(Long userId, Long productId, Integer quantity) {
        int qty = quantity == null ? 1 : quantity;
        if (qty <= 0) {
            throw new AppException(400, "Quantity must be at least 1");
        }

        Product product = products.findById(productId)
                .filter(Product::isActive)
                .orElseThrow(() -> new AppException(404, "Product not found")); // Step 4

        CartItem existing = cartItems.findByUserIdAndProductId(userId, productId).orElse(null);
        int alreadyInCart = existing == null ? 0 : existing.getQuantity();
        int requestedTotal = alreadyInCart + qty;

        if (requestedTotal > product.getStock()) { // Step 5
            String reason = product.getStock() == 0
                    ? "Out of stock"
                    : "Insufficient stock. Only " + product.getStock() + " left and you already have "
                      + alreadyInCart + " in your cart.";
            throw new AppException(409, reason);
        }

        if (existing == null) { // Step 6 - insert a new cart row
            CartItem item = new CartItem();
            item.setUserId(userId);
            item.setProductId(productId);
            item.setQuantity(qty);
            cartItems.save(item);
        } else { // Step 6 - cart_quantity = cart_quantity + quantity
            existing.setQuantity(requestedTotal);
            cartItems.save(existing);
        }
        return new Dtos.MessageResponse("Item added to cart"); // Step 7
    }

    /** Algorithm E step 5a - update the quantity of a cart line. */
    @Transactional
    public Dtos.MessageResponse updateQuantity(Long userId, Long productId, Integer quantity) {
        int qty = quantity == null ? 0 : quantity;
        CartItem item = cartItems.findByUserIdAndProductId(userId, productId)
                .orElseThrow(() -> new AppException(404, "This item is not in your cart"));

        if (qty <= 0) {
            cartItems.delete(item);
            return new Dtos.MessageResponse("Item removed from cart");
        }

        Product product = products.findById(productId)
                .orElseThrow(() -> new AppException(404, "Product not found"));
        if (qty > product.getStock()) {
            throw new AppException(409, "Insufficient stock. Only " + product.getStock() + " available.");
        }
        item.setQuantity(qty);
        cartItems.save(item);
        return new Dtos.MessageResponse("Cart updated");
    }

    /** Algorithm E step 5b - remove an item. */
    @Transactional
    public Dtos.MessageResponse remove(Long userId, Long productId) {
        CartItem item = cartItems.findByUserIdAndProductId(userId, productId)
                .orElseThrow(() -> new AppException(404, "This item is not in your cart"));
        cartItems.delete(item);
        return new Dtos.MessageResponse("Item removed from cart");
    }

    /** Algorithm A step 25 - clear the cart after a successful order. */
    @Transactional
    public void clear(Long userId) {
        cartItems.deleteByUserId(userId);
    }

    public long count(Long userId) {
        return cartItems.countByUserId(userId);
    }
}
