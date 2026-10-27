package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.dto.Dtos;
import com.shopcart.model.CartItem;
import com.shopcart.model.Coupon;
import com.shopcart.model.CouponType;
import com.shopcart.model.Product;
import com.shopcart.repo.CartItemRepository;
import com.shopcart.repo.CouponRepository;
import com.shopcart.repo.ProductRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** Algorithm F - total calculation: subtotal, tax, shipping, discount, grand total. */
@Service
public class PricingService {

    private final CartItemRepository cartItems;
    private final ProductRepository products;
    private final CouponRepository coupons;

    @Value("${app.pricing.tax-rate:0.18}")
    private BigDecimal taxRate;

    @Value("${app.pricing.free-shipping-limit:999.00}")
    private BigDecimal freeShippingLimit;

    @Value("${app.pricing.shipping-charge:79.00}")
    private BigDecimal shippingCharge;

    public PricingService(CartItemRepository cartItems, ProductRepository products, CouponRepository coupons) {
        this.cartItems = cartItems;
        this.products = products;
        this.coupons = coupons;
    }

    /**
     * Builds the bill for a user's cart.
     *
     * @param couponCode optional coupon to apply (null/blank means no discount)
     */
    public Dtos.BillView quote(Long userId, String couponCode) {
        List<CartItem> cart = cartItems.findByUserIdOrderByAddedAtAsc(userId);

        List<Dtos.CartLine> lines = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO; // Step 2

        for (CartItem item : cart) { // Step 3
            Optional<Product> maybeProduct = products.findById(item.getProductId());
            if (maybeProduct.isEmpty() || !maybeProduct.get().isActive()) {
                continue; // product was removed from the catalogue - silently drop the line
            }
            Product product = maybeProduct.get();
            BigDecimal lineTotal = product.getPrice()
                    .multiply(BigDecimal.valueOf(item.getQuantity()))
                    .setScale(2, RoundingMode.HALF_UP);
            subtotal = subtotal.add(lineTotal);
            lines.add(new Dtos.CartLine(product.getId(), product.getName(),
                    product.getBrand() == null ? "ShopCart" : product.getBrand(), product.getImage(),
                    product.getPrice(), item.getQuantity(), product.getStock(), lineTotal));
        }

        subtotal = subtotal.setScale(2, RoundingMode.HALF_UP);

        BigDecimal tax = subtotal.multiply(taxRate).setScale(2, RoundingMode.HALF_UP); // Step 4

        BigDecimal shipping = subtotal.compareTo(freeShippingLimit) >= 0 // Step 5
                ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                : shippingCharge.setScale(2, RoundingMode.HALF_UP);

        BigDecimal discount = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP); // Step 6
        String appliedCoupon = null;
        String couponMessage = null;
        if (couponCode != null && !couponCode.isBlank() && !lines.isEmpty()) {
            Coupon coupon = coupons.findByCodeIgnoreCase(couponCode.trim())
                    .orElseThrow(() -> new AppException(400, "Invalid coupon code"));
            if (subtotal.compareTo(coupon.getMinSubtotal()) < 0) {
                throw new AppException(400, "Coupon " + coupon.getCode() + " needs a minimum order of "
                        + money(coupon.getMinSubtotal()));
            }
            discount = coupon.getType() == CouponType.PERCENT
                    ? subtotal.multiply(coupon.getValue()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
                    : coupon.getValue().setScale(2, RoundingMode.HALF_UP);
            BigDecimal cap = subtotal.add(tax).add(shipping);
            if (discount.compareTo(cap) > 0) {
                discount = cap;
            }
            appliedCoupon = coupon.getCode();
            couponMessage = "Coupon " + coupon.getCode() + " applied, you saved " + money(discount);
        }

        BigDecimal grandTotal = subtotal.add(tax).add(shipping).subtract(discount) // Step 7
                .max(BigDecimal.ZERO)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal gap = subtotal.compareTo(freeShippingLimit) >= 0
                ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                : freeShippingLimit.subtract(subtotal).setScale(2, RoundingMode.HALF_UP);

        int itemCount = lines.stream().mapToInt(Dtos.CartLine::quantity).sum();

        return new Dtos.BillView(lines, itemCount, subtotal, tax, shipping, discount, grandTotal,
                appliedCoupon, couponMessage, gap, taxRate, freeShippingLimit); // Step 8
    }

    public BigDecimal getTaxRate() {
        return taxRate;
    }

    public BigDecimal getFreeShippingLimit() {
        return freeShippingLimit;
    }

    private String money(BigDecimal value) {
        return "Rs." + value.setScale(2, RoundingMode.HALF_UP);
    }
}
