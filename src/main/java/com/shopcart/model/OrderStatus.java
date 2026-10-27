package com.shopcart.model;

/** Order lifecycle from Algorithm H step 4. */
public enum OrderStatus {
    PLACED,
    PROCESSING,
    SHIPPED,
    OUT_FOR_DELIVERY,
    DELIVERED,
    CANCELLED;

    public boolean canTransitionTo(OrderStatus next) {
        return switch (this) {
            case PLACED -> next == PROCESSING || next == CANCELLED;
            case PROCESSING -> next == SHIPPED || next == CANCELLED;
            case SHIPPED -> next == OUT_FOR_DELIVERY;
            case OUT_FOR_DELIVERY -> next == DELIVERED;
            case DELIVERED, CANCELLED -> false;
        };
    }

    public boolean isCancellable() {
        return this == PLACED || this == PROCESSING;
    }
}
