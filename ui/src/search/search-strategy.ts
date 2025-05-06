import { SearchApiClient } from "./search-api";
import {
    deduplicateProducts,
    groupRelatedProducts,
    sortProductsByRelevance,
    sortProductsByBrand,
    prioritizeCategoryVersion,
    extractBrandName,
    findDominantProductType,
    sortByFuseRelevance
} from "./search-utils";
import type { Product } from "./search-types";
import { PRODUCT_TYPE_MAP, CATEGORY_MAPPINGS, SPECIAL_BRAND_CASES } from "./search-constants";

/**
 * Base interface for all search strategies
 */
export interface SearchStrategy {
    execute(): Promise<{ products: Product[], total: number }>;
}

/**
 * Strategy for when a specific product is selected
 */
export class ProductSelectionStrategy implements SearchStrategy {
    private apiClient: SearchApiClient;
    private productHash: any;
    private searchQuery: string;
    private fuseResults: Product[];

    constructor(apiClient: SearchApiClient, productHash: any, searchQuery: string, fuseResults: Product[] = []) {
        this.apiClient = apiClient;
        this.productHash = productHash;
        this.searchQuery = searchQuery;
        this.fuseResults = fuseResults;
    }

    // Helper function to group products by brand while maintaining segment integrity
    private groupByBrand(products: Product[]): Product[] {
        const brandGroups = new Map();
        const brandsOrder = [];

        products.forEach(product => {
            const nameParts = product.name.split(/®|\s/);
            let brandName = product.name.includes('®') ?
                product.name.split('®')[0].trim() :
                nameParts[0];

            if (!brandGroups.has(brandName)) {
                brandGroups.set(brandName, []);
                brandsOrder.push(brandName);
            }
            brandGroups.get(brandName).push(product);
        });

        const groupedProducts = [];
        brandsOrder.forEach(brand => {
            groupedProducts.push(...brandGroups.get(brand));
        });

        return groupedProducts;
    }

    async execute(): Promise<{ products: Product[], total: number }> {
        const matchingProducts = await this.apiClient.getAllProductVersionsByHash(this.productHash) || [];

        // Ensure this.fuseResults is always an array
        const fuseResults = this.fuseResults || [];

        if (matchingProducts.length === 0) {
            return {
                products: deduplicateProducts(fuseResults),
                total: fuseResults.length
            };
        }

        const selectedProduct = prioritizeCategoryVersion(matchingProducts, this.searchQuery);

        if (!selectedProduct) {
            return {
                products: deduplicateProducts(this.fuseResults),
                total: this.fuseResults.length
            };
        }

        if (selectedProduct.product_type) {
            const result = await this.handleProductWithType(selectedProduct);
            return result;
        } else {
            const hashStr = this.productHash.toString();
            const products = [
                selectedProduct,
                ...this.fuseResults.filter(p => JSON.stringify(p.hash) !== hashStr)
            ];

            return {
                products: deduplicateProducts(products),
                total: products.length
            };
        }
    }

    private async handleProductWithType(selectedProduct: Product): Promise<{ products: Product[], total: number }> {
        try {
            if (!selectedProduct.category || !selectedProduct.subcategory || !selectedProduct.product_type) {
                throw new Error("Product missing category information");
            }

            // Create concurrent API requests for both main calls
            const [sameTypeResult, subcategoryResult] = await Promise.all([
                // Fetch same type products
                this.apiClient.getProductsByType(
                    selectedProduct.category,
                    selectedProduct.subcategory,
                    selectedProduct.product_type
                ),
                // Fetch subcategory products
                selectedProduct.subcategory ?
                    this.apiClient.getAdditionalSubcategoryProducts(
                        selectedProduct.category,
                        selectedProduct.subcategory,
                        null, // Pass null to get ALL product types
                        100
                    ) :
                    Promise.resolve([])
            ]);

            const sameTypeProducts = sameTypeResult.products;
            const subcategoryProducts = subcategoryResult || [];

            const hashStr = this.productHash.toString();

            // Group related products from fuseResults
            const relatedGroups = groupRelatedProducts(
                selectedProduct,
                sameTypeProducts,
                this.fuseResults || []
            );

            // Sort subcategory products by relevance to search query
            if (subcategoryProducts.length > 0) {
                sortByFuseRelevance(subcategoryProducts, this.searchQuery);
            }

            // Fetch mapped products - now get entire subcategories
            let mappedProducts: Product[] = [];
            if (selectedProduct.product_type &&
                CATEGORY_MAPPINGS?.productTypes &&
                CATEGORY_MAPPINGS.productTypes[selectedProduct.product_type]) {

                const mapping = CATEGORY_MAPPINGS.productTypes[selectedProduct.product_type];

                // Fetch the entire mapped subcategory
                if (mapping.categories[0] && mapping.subcategories[0]) {
                    try {
                        // Build concurrent requests for mapped types
                        const mappedTypePromises = mapping.mappedTypes.map(mappedType =>
                            this.apiClient.getProductsByType(
                                mapping.categories[0],
                                mapping.subcategories[0],
                                mappedType,
                                20
                            )
                        );

                        // Add request for other products from same subcategory
                        mappedTypePromises.push(
                            this.apiClient.getAdditionalSubcategoryProducts(
                                mapping.categories[0],
                                mapping.subcategories[0],
                                null,
                                80
                            )
                        );

                        // Execute all requests concurrently
                        const mappedResults = await Promise.all(mappedTypePromises);

                        // Process results
                        for (let i = 0; i < mappedResults.length; i++) {
                            if (i < mapping.mappedTypes.length) {
                                // Type-specific results
                                mappedProducts = [...mappedProducts, ...(mappedResults[i].products || [])];
                            } else {
                                // Additional subcategory products
                                mappedProducts = [...mappedProducts, ...(mappedResults[i] || [])];
                            }
                        }

                        // Sort mapped products with exact type matches first
                        mappedProducts.sort((a, b) => {
                            // First prioritize products of the specifically mapped types
                            const aIsExactMappedType = mapping.mappedTypes.includes(a.product_type || '');
                            const bIsExactMappedType = mapping.mappedTypes.includes(b.product_type || '');

                            if (aIsExactMappedType && !bIsExactMappedType) return -1;
                            if (!aIsExactMappedType && bIsExactMappedType) return 1;

                            // Then sort remaining by relevance
                            return sortByFuseRelevance([a, b], this.searchQuery);
                        });
                    } catch (error) {
                        console.error(`Error fetching mapped subcategory products: ${error}`);
                    }
                }
            }
            // Check for subcategory mappings if no product type mappings found
            else if (selectedProduct.subcategory &&
                CATEGORY_MAPPINGS?.subcategories &&
                CATEGORY_MAPPINGS.subcategories[selectedProduct.subcategory]) {

                const mapping = CATEGORY_MAPPINGS.subcategories[selectedProduct.subcategory];

                // Build concurrent requests for all mapped subcategories
                if (mapping.categories[0]) {
                    try {
                        const subcatPromises = mapping.mappedSubcategories.map(mappedSubcat =>
                            this.apiClient.getAdditionalSubcategoryProducts(
                                mapping.categories[0],
                                mappedSubcat,
                                null,
                                20
                            )
                        );

                        // Execute all requests concurrently
                        const results = await Promise.all(subcatPromises);

                        // Process results
                        for (const products of results) {
                            mappedProducts = [...mappedProducts, ...(products || [])];
                        }
                    } catch (error) {
                        console.error(`Error fetching mapped subcategory products: ${error}`);
                    }
                }
            }

            // Extract brand name from selected product
            const productLower = selectedProduct.name.toLowerCase();
            let brandName;

            // Check for special brand cases
            for (const [prefix, brandValue] of Object.entries(SPECIAL_BRAND_CASES)) {
                if (productLower.startsWith(prefix)) {
                    brandName = brandValue;
                    break;
                }
            }

            // Fall back to original logic if no special case matched
            if (!brandName) {
                const brandParts = selectedProduct.name.split(/®|\s/);
                brandName = selectedProduct.name.includes('-') || selectedProduct.name.includes(' ') ?
                    selectedProduct.name.split(/®/)[0].trim() :
                    brandParts[0];
            }

            // Apply brand-based sorting to ALL product groups
            if (brandName) {
                sortProductsByBrand(sameTypeProducts, brandName);
                sortProductsByBrand(mappedProducts, brandName);
                sortProductsByBrand(subcategoryProducts, brandName);
            }
            // Fall back to relevance sorting for all groups
            else if (this.searchQuery) {
                sortProductsByRelevance(sameTypeProducts, this.searchQuery);
                sortByFuseRelevance(mappedProducts, this.searchQuery);
                sortByFuseRelevance(subcategoryProducts, this.searchQuery);
            }

            // Group brands within each segment
            const selectedProductArray = [selectedProduct];
            const groupedTypeProducts = this.groupByBrand(sameTypeProducts);
            const groupedMappedProducts = this.groupByBrand(mappedProducts);
            const groupedSubcategoryProducts = this.groupByBrand(subcategoryProducts);
            const groupedRelatedProducts = this.groupByBrand([
                ...relatedGroups.sameSubcategoryProducts,
                ...relatedGroups.sameCategoryProducts,
                ...relatedGroups.otherProducts
            ]);

            // Combine while preserving segment order
            const finalProducts = [
                ...selectedProductArray,
                ...groupedTypeProducts,
                ...groupedMappedProducts,
                ...groupedSubcategoryProducts,
                ...groupedRelatedProducts
            ];


            return {
                products: deduplicateProducts(finalProducts),
                total: finalProducts.length
            };
        } catch (error) {

            console.error("Error in product type strategy:", error);

            // Fallback to just the selected product and fuseResults
            const hashStr = this.productHash.toString();
            const products = [
                selectedProduct,
                ...this.fuseResults.filter(p => JSON.stringify(p.hash) !== hashStr)
            ];

            return {
                products: deduplicateProducts(products),
                total: products.length
            };
        }
    }
}

/**
 * Strategy for direct search (typing and hitting Enter/View All)
 */
export class DirectSearchStrategy implements SearchStrategy {
    private apiClient: SearchApiClient;
    private searchQuery: string;
    private fuseResults: Product[];

    constructor(apiClient: SearchApiClient, searchQuery: string, fuseResults: Product[] = []) {
        this.apiClient = apiClient;
        this.searchQuery = searchQuery;
        this.fuseResults = fuseResults;
    }

    // Helper function to group products by brand while maintaining segment integrity
    private groupByBrand(products: Product[]): Product[] {
        const brandGroups = new Map();
        const brandsOrder = [];

        products.forEach(product => {
            const nameParts = product.name.split(/®|\s/);
            let brandName = product.name.includes('®') ?
                product.name.split('®')[0].trim() :
                nameParts[0];

            if (!brandGroups.has(brandName)) {
                brandGroups.set(brandName, []);
                brandsOrder.push(brandName);
            }
            brandGroups.get(brandName).push(product);
        });

        const groupedProducts = [];
        brandsOrder.forEach(brand => {
            groupedProducts.push(...brandGroups.get(brand));
        });

        return groupedProducts;
    }

    async execute(): Promise<{ products: Product[], total: number }> {

        const mappedTypeResult = await this.tryUsingMappedProductType();

        if (mappedTypeResult) {

            return mappedTypeResult;
        }

        const dominantTypeResult = await this.tryUsingDominantType();

        if (dominantTypeResult) {

            return dominantTypeResult;
        }


        return {
            products: deduplicateProducts(this.fuseResults),
            total: this.fuseResults.length
        };
    }

    private async tryUsingMappedProductType(): Promise<{ products: Product[], total: number } | null> {
        const trimmedTerm = this.searchQuery.toLowerCase().trim();
        const mappedType = PRODUCT_TYPE_MAP[trimmedTerm];

        if (!mappedType || !this.fuseResults?.length) return null;

        // Find a product with this type from Fuse results
        const referenceProduct = this.fuseResults.find(p => p.product_type === mappedType);

        if (!referenceProduct || !referenceProduct.category || !referenceProduct.subcategory) {
            return null;
        }

        try {
            // Make initial API calls concurrently
            const [typeProductsResult, subcategoryProductsResult] = await Promise.all([
                // 1. Fetch all products of this mapped type
                this.apiClient.getProductsByType(
                    referenceProduct.category,
                    referenceProduct.subcategory,
                    mappedType,
                    100
                ),
                // 2. Get other products from the same subcategory
                this.apiClient.getAdditionalSubcategoryProducts(
                    referenceProduct.category,
                    referenceProduct.subcategory,
                    null,  // Pass null to get ALL product types
                    50
                )
            ]);

            const typeProducts = typeProductsResult.products;
            if (typeProducts.length === 0) return null;

            const subcategoryProducts = subcategoryProductsResult;

            // 3. Get mapped products from mapped categories concurrently
            let mappedProducts: Product[] = [];
            if (CATEGORY_MAPPINGS?.productTypes && CATEGORY_MAPPINGS.productTypes[mappedType]) {
                const mapping = CATEGORY_MAPPINGS.productTypes[mappedType];

                if (mapping.categories[0] && mapping.subcategories[0]) {
                    // Create array of promises for all mapped API calls
                    const mappedPromises = mapping.mappedTypes.map(mType =>
                        this.apiClient.getProductsByType(
                            mapping.categories[0],
                            mapping.subcategories[0],
                            mType,
                            20
                        )
                    );

                    // Add subcategory products promise
                    mappedPromises.push(
                        this.apiClient.getAdditionalSubcategoryProducts(
                            mapping.categories[0],
                            mapping.subcategories[0],
                            null,
                            30
                        )
                    );

                    // Execute all promises concurrently
                    const results = await Promise.all(mappedPromises);

                    // Process results
                    for (let i = 0; i < results.length; i++) {
                        if (i < mapping.mappedTypes.length) {
                            // Product type results
                            mappedProducts = [...mappedProducts, ...(results[i].products || [])];
                        } else {
                            // Subcategory results
                            mappedProducts = [...mappedProducts, ...(results[i] || [])];
                        }
                    }
                }
            }

            // 4. Sort properly
            sortByFuseRelevance(typeProducts, this.searchQuery);
            if (subcategoryProducts.length > 0) {
                sortByFuseRelevance(subcategoryProducts, this.searchQuery);
            }
            if (mappedProducts.length > 0) {
                sortByFuseRelevance(mappedProducts, this.searchQuery);
            }

            // Group brands within each segment
            const groupedTypeProducts = this.groupByBrand(typeProducts);
            const groupedMappedProducts = this.groupByBrand(mappedProducts);
            const groupedSubcategoryProducts = this.groupByBrand(subcategoryProducts);

            // Combine while preserving segment order
            const finalProducts = [
                ...groupedTypeProducts,
                ...groupedMappedProducts,
                ...groupedSubcategoryProducts
            ];

            return {
                products: deduplicateProducts(finalProducts),
                total: finalProducts.length
            };
        } catch (error) {
            console.error("Error fetching mapped type products:", error);
            return null;
        }
    }

    private async tryUsingDominantType(): Promise<{ products: Product[], total: number } | null> {
        const dominantTypeData = findDominantProductType(this.fuseResults, this.searchQuery);

        if (!dominantTypeData || !dominantTypeData.referenceProduct) {
            return null;
        }

        const { dominantType, referenceProduct } = dominantTypeData;

        if (!referenceProduct.category || !referenceProduct.subcategory) {
            return null;
        }

        try {

            // Fetch initial products concurrently

            const [typeProductsResult, subcategoryProductsResult] = await Promise.all([
                this.apiClient.getProductsByType(
                    referenceProduct.category,
                    referenceProduct.subcategory,
                    referenceProduct.product_type,
                    100
                ),
                this.apiClient.getAdditionalSubcategoryProducts(
                    referenceProduct.category,
                    referenceProduct.subcategory,
                    null,
                    50
                )
            ]);


            const typeProducts = typeProductsResult.products;
            if (typeProducts.length === 0) return null;

            const subcategoryProducts = subcategoryProductsResult;

            // Fetch mapped products concurrently
            let mappedProducts: Product[] = [];
            if (referenceProduct.product_type &&
                CATEGORY_MAPPINGS?.productTypes &&
                CATEGORY_MAPPINGS.productTypes[referenceProduct.product_type]) {


                const mapping = CATEGORY_MAPPINGS.productTypes[referenceProduct.product_type];

                if (mapping.categories[0] && mapping.subcategories[0]) {
                    try {
                        // Create promises for all mapped type requests
                        const mappedTypePromises = mapping.mappedTypes.map(mappedType =>
                            this.apiClient.getProductsByType(
                                mapping.categories[0],
                                mapping.subcategories[0],
                                mappedType,
                                20
                            )
                        );

                        // Add promise for other subcategory products
                        mappedTypePromises.push(
                            this.apiClient.getAdditionalSubcategoryProducts(
                                mapping.categories[0],
                                mapping.subcategories[0],
                                null,
                                30
                            )
                        );

                        // Execute all requests concurrently
                        const results = await Promise.all(mappedTypePromises);

                        // Process results
                        for (let i = 0; i < results.length; i++) {
                            if (i < mapping.mappedTypes.length) {
                                // For mapped types
                                mappedProducts = [...mappedProducts, ...(results[i].products || [])];
                            } else {
                                // For other subcategory products
                                mappedProducts = [...mappedProducts, ...(results[i] || [])];
                            }
                        }
                    } catch (error) {
                        console.error(`Error fetching mapped products: ${error}`);
                    }
                }
                console.log(`Fetched ${mappedProducts.length} mapped products`);
            }

            const relatedGroups = groupRelatedProducts(
                referenceProduct,
                typeProducts,
                this.fuseResults
            );

            // Apply brand-based sorting
            const brandName = extractBrandName(this.searchQuery, dominantType);

            if (brandName) {
                sortProductsByBrand(typeProducts, brandName);
                sortProductsByBrand(subcategoryProducts, brandName);
                sortProductsByBrand(mappedProducts, brandName);
            } else {
                sortByFuseRelevance(typeProducts, this.searchQuery);
                sortByFuseRelevance(subcategoryProducts, this.searchQuery);
                sortByFuseRelevance(mappedProducts, this.searchQuery);
            }

            // Group brands within each segment
            const groupedTypeProducts = this.groupByBrand(typeProducts);
            const groupedMappedProducts = this.groupByBrand(mappedProducts);
            const groupedSubcategoryProducts = this.groupByBrand(subcategoryProducts);
            const groupedRelatedProducts = this.groupByBrand([
                ...relatedGroups.sameSubcategoryProducts,
                ...relatedGroups.sameCategoryProducts,
                ...relatedGroups.otherProducts
            ]);

            // Combine while preserving segment order
            const finalProducts = [
                ...groupedTypeProducts,
                ...groupedMappedProducts,
                ...groupedSubcategoryProducts,
                ...groupedRelatedProducts
            ];

            return {
                products: deduplicateProducts(finalProducts),
                total: finalProducts.length
            };
        } catch (error) {
            console.error("Error in dominant type approach:", error);
            return null;
        }
    }
}