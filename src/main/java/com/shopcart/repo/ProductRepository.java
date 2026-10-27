package com.shopcart.repo;

import com.shopcart.model.Product;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {

    List<Product> findByActiveTrueOrderByIdAsc();

    List<Product> findByActiveTrueAndCategorySlugOrderByIdAsc(String slug);

    List<Product> findByActiveTrueAndNameContainingIgnoreCaseOrderByIdAsc(String q);

    List<Product> findByStockLessThanEqualAndActiveTrueOrderByStockAsc(int threshold);

    /** Row lock so two concurrent checkouts can never oversell the same product (Algorithm A step 24). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id")
    Optional<Product> lockById(@Param("id") Long id);
}
