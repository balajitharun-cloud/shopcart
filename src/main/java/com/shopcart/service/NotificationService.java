package com.shopcart.service;

import com.shopcart.model.Order;
import com.shopcart.model.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Algorithm A step 26 - send the Email/SMS confirmation.
 * In this build the notification is logged; swap the two log lines for a real
 * mail/SMS provider (e.g. JavaMailSender, an SMS gateway) without touching callers.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    @Value("${app.store.support-email:support@shopcart.in}")
    private String supportEmail;

    public String sendOrderConfirmation(User user, Order order) {
        String maskedEmail = maskEmail(user.getEmail());
        String maskedPhone = maskPhone(user.getPhone());
        log.info("EMAIL -> {} : Order {} confirmed, total Rs.{}. Support: {}",
                maskedEmail, order.getOrderCode(), order.getGrandTotal(), supportEmail);
        log.info("SMS   -> {} : Your ShopCart order {} is placed. Track it in My Orders.",
                maskedPhone, order.getOrderCode());
        return "Confirmation sent to " + maskedEmail + " and " + maskedPhone;
    }

    public String sendStatusUpdate(User user, Order order) {
        log.info("EMAIL -> {} : Order {} is now {}", maskEmail(user.getEmail()),
                order.getOrderCode(), order.getStatus());
        return "Update sent to " + maskEmail(user.getEmail());
    }

    private String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return "customer";
        }
        int at = email.indexOf('@');
        String name = email.substring(0, at);
        String visible = name.length() <= 2 ? name.substring(0, 1) : name.substring(0, 2);
        return visible + "***" + email.substring(at);
    }

    private String maskPhone(String phone) {
        if (phone == null || phone.length() < 4) {
            return "your phone";
        }
        return "******" + phone.substring(phone.length() - 4);
    }
}
