package com.shopcart.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/** Coupon used by the discount step of Algorithm F (step 6). */
@Entity
@Table(name = "coupons")
public class Coupon {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CouponType type;

    /** 10 with PERCENT = 10%, 100 with FLAT = Rs.100 off. */
    @Column(name = "discount_value", nullable = false, precision = 12, scale = 2)
    private BigDecimal value;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal minSubtotal = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean active = true;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public CouponType getType() { return type; }
    public void setType(CouponType type) { this.type = type; }

    public BigDecimal getValue() { return value; }
    public void setValue(BigDecimal value) { this.value = value; }

    public BigDecimal getMinSubtotal() { return minSubtotal; }
    public void setMinSubtotal(BigDecimal minSubtotal) { this.minSubtotal = minSubtotal; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
