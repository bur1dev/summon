
import { decode } from "@msgpack/msgpack";
import Fuse from "fuse.js";
import type { Product, SearchResult } from "./search-types";
import { COMMON_QUALIFIERS, CATEGORY_PRIORITY_RULES, BRAND_MAPPINGS } from "./search-constants";

// ==========================================
// Product Data Processing
// ==========================================

/**
 * Decode products from ProductGroups
 */
export function decodeProducts(records: any[]): Product[] {
    const products: Product[] = [];

    for (const record of records) {
        try {
            const groupHash = record.signed_action.hashed.hash;
            const groupData = decode(record.entry.Present.entry);

            if (groupData && Array.isArray(groupData.products)) {
                groupData.products.forEach((product: any, index: number) => {
                    products.push({
                        ...product,
                        hash: {
                            groupHash,
                            index,
                            toString: function () {
                                return `${this.groupHash}:${this.index}`;
                            }
                        }
                    });
                });
            }
        } catch (error) {
            console.error("Error decoding product group:", error);
        }
    }

    return products;
}

/**
 * Deduplicate products based on composite hash value
 */
export function deduplicateProducts(products: Product[] | null | undefined): Product[] {
    if (!products || !Array.isArray(products)) {
        return [];
    }

    const uniqueMap = new Map<string, Product>();

    for (const product of products) {
        // Skip invalid products
        if (!product || !product.hash) continue;

        try {
            // Use the composite hash for comparison
            const hashKey = product.hash.toString();
            if (!uniqueMap.has(hashKey)) {
                uniqueMap.set(hashKey, product);
            }
        } catch (error) {
            console.error("Error processing product during deduplication:", error);
        }
    }

    return Array.from(uniqueMap.values());
}

/**
 * Group related products by their relationship to a reference product
 */
export function groupRelatedProducts(
    referenceProduct: Product,
    typeProducts: Product[],
    allProducts: Product[]
): {
    sameSubcategoryProducts: Product[],
    sameCategoryProducts: Product[],
    otherProducts: Product[]
} {
    // Create set of hash keys for type products
    const typeProdHashes = new Set(typeProducts.map(p => p.hash.toString()));
    const refHashStr = referenceProduct.hash.toString();

    // Filter out products already in typeProducts or the reference product
    const otherMatchedProducts = allProducts.filter(p =>
        p.hash.toString() !== refHashStr &&
        !typeProdHashes.has(p.hash.toString())
    );

    // Group by category relationship
    const sameSubcategoryProducts = otherMatchedProducts.filter(p =>
        p.subcategory &&
        referenceProduct.subcategory &&
        p.subcategory === referenceProduct.subcategory
    );

    const sameCategoryProducts = otherMatchedProducts.filter(p =>
        p.category &&
        referenceProduct.category &&
        p.category === referenceProduct.category &&
        (!p.subcategory ||
            !referenceProduct.subcategory ||
            p.subcategory !== referenceProduct.subcategory)
    );

    const otherProducts = otherMatchedProducts.filter(p =>
        !p.category ||
        !referenceProduct.category ||
        p.category !== referenceProduct.category
    );

    return {
        sameSubcategoryProducts,
        sameCategoryProducts,
        otherProducts
    };
}

// Rest of the utility functions remain the same as they handle products by their data
// rather than their identifiers, and the composite hash pattern we've established works
// seamlessly with them due to the toString() method on the hash object.

/**
 * Parse a query into main terms and qualifiers
 */
export function parseQuery(query: string): { mainTerms: string[], qualifiers: string[] } {
    const terms = query.toLowerCase().split(/\s+/);
    const qualifiers = terms.filter(term => COMMON_QUALIFIERS.includes(term));
    const mainTerms = terms.filter(term => !COMMON_QUALIFIERS.includes(term));

    return { mainTerms, qualifiers };
}

/**
 * Extract possible brand name from query based on product type
 */
export function extractBrandName(query: string, productType: string): string {
    if (!query || !productType) return "";

    const typePart = productType.toLowerCase();
    if (query.toLowerCase().includes(typePart)) {
        const parts = query.toLowerCase().split(typePart);
        // Extract remaining text and clean it
        return parts[parts.length - 1].trim();
    }

    return "";
}

// ==========================================
// Relevance Sorting
// ==========================================

/**
 * Sort products by relevance to search query
 */
export function sortProductsByRelevance(products: Product[], searchTerm: string): void {
    const searchTermLower = searchTerm.toLowerCase();
    const searchTerms = searchTermLower.split(/\s+/);

    products.sort((a, b) => {
        // 1. Exact brand match
        const aBrand = a.name.split("®")[0].toLowerCase();
        const bBrand = b.name.split("®")[0].toLowerCase();
        const isAExactBrand = aBrand === searchTermLower;
        const isBExactBrand = bBrand === searchTermLower;

        if (isAExactBrand && !isBExactBrand) return -1;
        if (!isAExactBrand && isBExactBrand) return 1;

        // 2. Contains brand name
        const aHasBrand = aBrand.includes(searchTermLower) || searchTermLower.includes(aBrand);
        const bHasBrand = bBrand.includes(searchTermLower) || searchTermLower.includes(bBrand);

        if (aHasBrand && !bHasBrand) return -1;
        if (!aHasBrand && bHasBrand) return 1;

        // 3. Text similarity score
        const aMatches = (a.name.toLowerCase().match(new RegExp(searchTermLower, "g")) || []).length;
        const bMatches = (b.name.toLowerCase().match(new RegExp(searchTermLower, "g")) || []).length;

        return bMatches - aMatches;
    });
}

/**
 * Sort products by brand match
 */
export function sortProductsByBrand(products: Product[], brandName: string): void {
    if (!brandName) return;

    // Check for special brand handling
    const brandKey = Object.keys(BRAND_MAPPINGS).find(key =>
        brandName.toLowerCase().includes(key));

    const brandInfo = brandKey ? BRAND_MAPPINGS[brandKey] : null;
    const brandVariations = brandInfo?.variations || [brandName.toLowerCase()];

    products.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        // Check if products match any brand variation
        const aMatchesBrand = brandVariations.some(v => aName.includes(v));
        const bMatchesBrand = brandVariations.some(v => bName.includes(v));

        if (aMatchesBrand && !bMatchesBrand) return -1;
        if (!aMatchesBrand && bMatchesBrand) return 1;

        return 0;
    });
}

/**
 * Sort products using Fuse relevance scoring
 */
export function sortByFuseRelevance(products: Product[], searchTerm: string): void {
    const fuse = new Fuse(products, {
        keys: [{ name: "name", weight: 2.0 }],
        threshold: 0.3,
        includeScore: true,
    });

    const scoredProducts = fuse.search(searchTerm);

    products.sort((a, b) => {
        const aScore = scoredProducts.find(
            p => p.item.hash.toString() === a.hash.toString()
        )?.score || 1;

        const bScore = scoredProducts.find(
            p => p.item.hash.toString() === b.hash.toString()
        )?.score || 1;

        return aScore - bScore;
    });
}

// ==========================================
// Category Prioritization
// ==========================================

/**
 * Find the best category version of a product based on search context
 */
export function prioritizeCategoryVersion(matchingProducts: Product[], searchTerm: string): Product | null {
    if (!matchingProducts.length) return null;
    if (matchingProducts.length === 1) return matchingProducts[0];

    console.log("Multiple category versions found:", matchingProducts.length);

    const searchTermLower = searchTerm.toLowerCase();

    // Apply context rules
    for (const rule of CATEGORY_PRIORITY_RULES) {
        if (searchTermLower.includes(rule.term)) {
            // Check additional condition if present
            if (!rule.condition || rule.condition(searchTermLower)) {
                const preferredVersion = matchingProducts.find(p => p.category === rule.preferredCategory);
                if (preferredVersion) {
                    console.log(`Prioritizing ${rule.preferredCategory} for '${rule.term}' products`);
                    return preferredVersion;
                }
            }
        }
    }

    // Default to first matching product if no rule matches
    return matchingProducts[0];
}

/**
 * Find dominant product type from search results
 */
export function findDominantProductType(
    products: Product[],
    searchTerm: string
): { dominantType: string, referenceProduct: Product } | null {
    if (!products.length) return null;

    // Count product types across results
    const typeCounter: Record<string, number> = {};

    products.slice(0, 10).forEach(p => {
        if (p.product_type) {
            typeCounter[p.product_type] = (typeCounter[p.product_type] || 0) + 1;
        }
    });

    // Parse query
    const { mainTerms } = parseQuery(searchTerm);

    // First check for exact matches with search term
    const exactTypeMatch = Object.keys(typeCounter).find(
        type => type.toLowerCase() === searchTerm.toLowerCase()
    );

    if (exactTypeMatch) {
        const referenceProduct = findReferenceProduct(products, exactTypeMatch, searchTerm);
        return referenceProduct ? { dominantType: exactTypeMatch, referenceProduct } : null;
    }

    // Check main term match
    if (mainTerms.length > 0) {
        const mainTerm = mainTerms[0];
        const exactMainTermMatch = Object.keys(typeCounter).find(
            type => type.toLowerCase() === mainTerm.toLowerCase()
        );

        if (exactMainTermMatch) {
            const referenceProduct = findReferenceProduct(products, exactMainTermMatch, searchTerm);
            return referenceProduct ? { dominantType: exactMainTermMatch, referenceProduct } : null;
        }

        // Get all product types from results
        const allTypes = new Set(
            products.filter(p => p.product_type).map(p => p.product_type)
        );

        // Look for exact match in all types
        const exactMatchFromAll = Array.from(allTypes).find(
            type => type?.toLowerCase() === mainTerm.toLowerCase()
        );

        if (exactMatchFromAll) {
            const referenceProduct = findReferenceProduct(products, exactMatchFromAll, searchTerm);
            return referenceProduct ? { dominantType: exactMatchFromAll, referenceProduct } : null;
        }

        // Look for types containing the main term
        const relevantTypes = Object.keys(typeCounter).filter(type =>
            type.toLowerCase().includes(mainTerm.toLowerCase())
        );

        if (relevantTypes.length > 0) {
            relevantTypes.sort((a, b) => typeCounter[b] - typeCounter[a]);
            const dominantType = relevantTypes[0];
            const referenceProduct = findReferenceProduct(products, dominantType, searchTerm);
            return referenceProduct ? { dominantType, referenceProduct } : null;
        }
    }

    // Fallback to most frequent type
    const mostFrequent = Object.entries(typeCounter)
        .sort((a, b) => b[1] - a[1])
        .find(([_, count]) => count >= 2);

    if (mostFrequent) {
        const dominantType = mostFrequent[0];
        const referenceProduct = findReferenceProduct(products, dominantType, searchTerm);
        return referenceProduct ? { dominantType, referenceProduct } : null;
    }

    return null;
}

/**
 * Find reference product for a dominant type
 */
// Likely in search-utils.ts
function findReferenceProduct(products: Product[], dominantType: string, searchTerm: string): Product | null {
    const searchTermLower = searchTerm.toLowerCase();

    // First prioritize products that match both type and search term
    const exactBrandMatch = products.find(
        p => p.product_type === dominantType &&
            p.name.toLowerCase().includes(searchTermLower)
    );

    if (exactBrandMatch) return exactBrandMatch;

    // Otherwise use first product of this type
    return products.find(p => p.product_type === dominantType) || null;
}