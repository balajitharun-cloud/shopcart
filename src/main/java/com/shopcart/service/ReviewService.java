package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.dto.Dtos;
import com.shopcart.model.Product;
import com.shopcart.model.Review;
import com.shopcart.model.User;
import com.shopcart.repo.ProductRepository;
import com.shopcart.repo.ReviewRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.format.DateTimeFormatter;
import java.util.List;

/** Product reviews plus the rating aggregate shown on cards. */
@Service
public class ReviewService {

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("d MMM yyyy");

    private final ReviewRepository reviews;
    private final ProductRepository products;

    public ReviewService(ReviewRepository reviews, ProductRepository products) {
        this.reviews = reviews;
        this.products = products;
    }

    @Transactional(readOnly = true)
    public Dtos.ReviewSummary summary(Long productId) {
        List<Review> list = reviews.findByProductIdOrderByCreatedAtDesc(productId);
        int[] distribution = new int[5];
        double total = 0;
        for (Review review : list) {
            int bucket = Math.max(1, Math.min(5, review.getRating()));
            distribution[5 - bucket]++;
            total += bucket;
        }
        double average = list.isEmpty() ? 0 : Math.round((total / list.size()) * 10) / 10.0;
        List<Dtos.ReviewView> views = list.stream()
                .map(r -> new Dtos.ReviewView(r.getId(), r.getAuthorName(), r.getRating(), r.getTitle(),
                        r.getBody(), r.getCreatedAt().format(STAMP)))
                .toList();
        return new Dtos.ReviewSummary(average, list.size(), distribution, views);
    }

    @Transactional
    public Dtos.ReviewSummary add(User user, Long productId, Dtos.ReviewRequest request) {
        Product product = products.findById(productId)
                .filter(Product::isActive)
                .orElseThrow(() -> new AppException(404, "Product not found"));

        int rating = request.rating() == null ? 0 : request.rating();
        if (rating < 1 || rating > 5) {
            throw new AppException(400, "Choose a rating between 1 and 5");
        }
        if (request.title() == null || request.title().isBlank()) {
            throw new AppException(400, "Give your review a short title");
        }

        Review review = new Review();
        review.setProductId(productId);
        review.setUserId(user.getId());
        review.setAuthorName(user.getName());
        review.setRating(rating);
        review.setTitle(request.title().trim());
        review.setBody(request.body() == null ? "" : request.body().trim());
        reviews.save(review);

        // keep the card aggregate in step with the reviews we actually hold
        List<Review> all = reviews.findByProductIdOrderByCreatedAtDesc(productId);
        double average = all.stream().mapToInt(Review::getRating).average().orElse(rating);
        product.setRating(Math.round(average * 10) / 10.0);
        product.setReviewCount((int) Math.max(product.getReviewCount(), all.size()));
        products.save(product);

        return summary(productId);
    }
}
