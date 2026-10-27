package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.model.PaymentMethod;
import com.shopcart.model.PaymentStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.UUID;

/**
 * Algorithm G - payment processing.
 *
 * <p>The real gateway redirect (steps 4-6) is simulated here so the project runs
 * without external credentials. The contract is what matters: a method and an
 * amount go in, a status plus a gateway reference come out.</p>
 *
 * <p>Test hook: any instrument containing the word "fail" is declined, which lets
 * the retry path (Algorithm A step 21) be demonstrated from the UI.</p>
 */
@Service
public class PaymentService {

    public record PaymentResult(boolean success, PaymentStatus status, String reference,
                                String maskedInstrument, String message) { }

    public PaymentResult charge(PaymentMethod method, BigDecimal amount, String detail) {
        // Step 3 - cash on delivery never talks to a gateway.
        if (method == PaymentMethod.COD) {
            return new PaymentResult(true, PaymentStatus.PENDING, "COD-" + shortRef(),
                    "Cash on Delivery", "Order confirmed. Please keep exact change ready.");
        }

        // Step 4/5 - the user enters card / UPI / bank details.
        String instrument = detail == null ? "" : detail.trim();
        if (instrument.isEmpty()) {
            throw new AppException(400, "Please enter your payment details");
        }
        validate(method, instrument);

        String masked = mask(method, instrument);

        // Step 6/7 - the gateway verifies and approves or declines.
        if (instrument.toLowerCase(Locale.ROOT).contains("fail")) {
            return new PaymentResult(false, PaymentStatus.FAILED, null, masked,
                    "Payment failed - the bank declined this transaction. Please try another method.");
        }

        return new PaymentResult(true, PaymentStatus.SUCCESS, "TXN-" + shortRef(), masked,
                "Payment of Rs." + amount + " successful.");
    }

    private void validate(PaymentMethod method, String instrument) {
        switch (method) {
            case CARD -> {
                String digits = instrument.replaceAll("[^0-9]", "");
                if (digits.length() < 12 || digits.length() > 19) {
                    throw new AppException(400, "Enter a valid card number (12-19 digits)");
                }
            }
            case UPI -> {
                if (!instrument.contains("@") || instrument.length() < 5) {
                    throw new AppException(400, "Enter a valid UPI ID, for example name@okbank");
                }
            }
            case NET_BANKING -> {
                if (instrument.length() < 3) {
                    throw new AppException(400, "Please choose your bank");
                }
            }
            default -> { }
        }
    }

    /** Only a masked instrument is ever stored - never raw card numbers. */
    private String mask(PaymentMethod method, String instrument) {
        switch (method) {
            case CARD -> {
                String digits = instrument.replaceAll("[^0-9]", "");
                return "Card ****" + digits.substring(digits.length() - 4);
            }
            case UPI -> {
                int at = instrument.indexOf('@');
                return at > 1 ? instrument.charAt(0) + "***" + instrument.substring(at) : instrument;
            }
            default -> {
                return instrument;
            }
        }
    }

    private String shortRef() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase(Locale.ROOT);
    }
}
