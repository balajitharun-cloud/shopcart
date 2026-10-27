package com.shopcart.service;

import com.shopcart.config.AppException;
import com.shopcart.dto.Dtos;
import com.shopcart.model.Product;
import com.shopcart.repo.CategoryRepository;
import com.shopcart.repo.ProductRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/** Algorithm A steps 7-10 - categories, search box and product details. */
@Service
public class CatalogService {

    private final ProductRepository products;
    private final CategoryRepository categories;

    public CatalogService(ProductRepository products, CategoryRepository categories) {
        this.products = products;
        this.categories = categories;
    }

    public List<Dtos.CategoryView> categories() {
        return categories.findAll().stream()
                .map(c -> new Dtos.CategoryView(c.getId(), c.getName(), c.getSlug()))
                .toList();
    }

    /** Step 8/9 - a category filter, a search term, or both. */
    public List<Dtos.ProductView> search(String category, String query) {
        boolean hasCategory = category != null && !category.isBlank() && !"all".equalsIgnoreCase(category);
        boolean hasQuery = query != null && !query.isBlank();

        List<Product> found;
        if (hasCategory && hasQuery) {
            found = products.findByActiveTrueAndCategorySlugOrderByIdAsc(category).stream()
                    .filter(p -> matches(p, query))
                    .toList();
        } else if (hasCategory) {
            found = products.findByActiveTrueAndCategorySlugOrderByIdAsc(category);
        } else if (hasQuery) {
            found = products.findByActiveTrueAndNameContainingIgnoreCaseOrderByIdAsc(query.trim());
        } else {
            found = products.findByActiveTrueOrderByIdAsc();
        }
        return found.stream().map(this::toView).toList();
    }

    public Dtos.ProductView get(Long id) {
        Product product = products.findById(id)
                .filter(Product::isActive)
                .orElseThrow(() -> new AppException(404, "Product not found"));
        return toView(product);
    }

    private boolean matches(Product product, String query) {
        String q = query.trim().toLowerCase();
        return product.getName().toLowerCase().contains(q)
                || (product.getDescription() != null && product.getDescription().toLowerCase().contains(q));
    }

    public Dtos.ProductView toView(Product product) {
        return new Dtos.ProductView(product.getId(), product.getName(), product.getDescription(),
                product.getPrice(), product.getStock(),
                product.getCategory() == null ? "Uncategorised" : product.getCategory().getName(),
                product.getImage(), product.isActive());
    }
}
