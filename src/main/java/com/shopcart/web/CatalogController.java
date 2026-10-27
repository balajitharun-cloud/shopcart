package com.shopcart.web;

import com.shopcart.dto.Dtos;
import com.shopcart.service.CatalogService;
import com.shopcart.service.PricingService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Algorithm A steps 7-10 - public catalogue browsing. */
@RestController
@RequestMapping("/api")
public class CatalogController {

    private final CatalogService catalogService;
    private final PricingService pricingService;

    @Value("${app.store.support-email:support@shopcart.in}")
    private String supportEmail;

    public CatalogController(CatalogService catalogService, PricingService pricingService) {
        this.catalogService = catalogService;
        this.pricingService = pricingService;
    }

    @GetMapping("/catalog/categories")
    public List<Dtos.CategoryView> categories() {
        return catalogService.categories();
    }

    @GetMapping("/catalog/products")
    public List<Dtos.ProductView> products(@RequestParam(required = false) String category,
                                           @RequestParam(name = "q", required = false) String query) {
        return catalogService.search(category, query);
    }

    @GetMapping("/catalog/products/{id}")
    public Dtos.ProductView product(@PathVariable Long id) {
        return catalogService.get(id);
    }

    /** Storefront settings so the UI can show the same tax/shipping rules the server applies. */
    @GetMapping("/config")
    public Map<String, Object> config() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taxRate", pricingService.getTaxRate());
        payload.put("freeShippingLimit", pricingService.getFreeShippingLimit());
        payload.put("supportEmail", supportEmail);
        return payload;
    }
}
