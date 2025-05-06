<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { debounce } from "lodash";
    import Fuse from "fuse.js";
    import { decode } from "@msgpack/msgpack";
    import { Search } from "lucide-svelte"; // Added Search icon import
    import SearchCacheService from "./SearchCacheService";
    import type { Product, ProductTypeGroup } from "./search-types";
    import { parseQuery } from "./search-utils";

    export let store;
    export let productCache;

    const dispatch = createEventDispatcher();

    let searchQuery = "";
    let showDropdown = false;
    let searchResults: Array<Product | ProductTypeGroup> = [];
    let isLoading = false;
    let productIndex: Product[] = [];
    let fuse: Fuse<Product>;

    // Fuse.js search options
    const fuseOptions = {
        keys: [
            { name: "name", weight: 2.0 },
            { name: "brand", weight: 1.5 },
            { name: "product_type", weight: 1.0 },
        ],
        threshold: 0.3,
        includeScore: true,
        useExtendedSearch: true,
        ignoreLocation: true,
    };

    onMount(async () => {
        try {
            // Use category-based search index instead of dedicated search index
            const products = await SearchCacheService.getSearchIndex(store);
            initializeProductIndex(products);
        } catch (error) {
            console.error("Error initializing search:", error);
        }
    });

    function initializeProductIndex(products: any[]) {
        if (!products || products.length === 0) {
            console.error("No products available for search index");
            return;
        }

        productIndex = products.map((product) => ({
            name: product.name,
            hash: product.hash,
            image_url: product.image_url,
            price: product.price,
            category: product.category,
            subcategory: product.subcategory,
            product_type: product.product_type,
            size: product.size,
            brand: product.brand,
        }));

        initFuse(productIndex);

        // Data integrity check
        validateProductIndex(productIndex);
    }

    function validateProductIndex(products: Product[]) {
        // Check for products without names
        const productsWithoutNames = products.filter((p) => !p.name);

        // Log sample products
        if (productsWithoutNames.length > 0) {
        }

        // Check for berry products as a sample test case
        const berryProducts = products.filter(
            (p) =>
                (p.name && p.name.toLowerCase().includes("berr")) ||
                (p.product_type &&
                    p.product_type.toLowerCase().includes("berr")),
        );

        // Check for empty/malformed products
    }

    function initFuse(products: Product[]) {
        fuse = new Fuse(products, fuseOptions);
    }

    // Debounced search function
    const debouncedSearch = debounce(() => {
        if (!isSearchReady()) return;

        isLoading = true;

        try {
            // Parse the query to get main terms and qualifiers
            const { mainTerms, qualifiers } = parseQuery(searchQuery);
            const mainQuery = mainTerms.join(" ");

            // Perform search with Fuse.js
            let fuseResults = searchWithFuse(mainQuery || searchQuery);

            // Process and categorize results
            const processedResults = processSearchResults(
                fuseResults,
                qualifiers,
            );

            searchResults = processedResults;
            showDropdown = searchResults.length > 0;
        } catch (error) {
            console.error("Search error:", error);
            searchResults = [];
            showDropdown = false;
        } finally {
            isLoading = false;
        }
    }, 300);

    function isSearchReady(): boolean {
        if (!searchQuery.trim()) {
            searchResults = [];
            showDropdown = false;
            return false;
        }

        if (!fuse || productIndex.length === 0) {
            console.warn("Cannot search - fuse or product index not available");
            return false;
        }

        return true;
    }

    function searchWithFuse(query: string): any[] {
        return fuse.search(query);
    }

    function processSearchResults(
        fuseResults: Fuse.FuseResult<Product>[],
        qualifiers: string[],
    ): Array<Product | ProductTypeGroup> {
        // Enhanced sorting with multiple priority levels
        const searchLower = searchQuery.toLowerCase();
        const searchTerms = searchLower.split(/\s+/);

        fuseResults.sort((a, b) =>
            sortResultsByRelevance(a, b, searchTerms, qualifiers),
        );

        // Create arrays for both product types and specific products
        const productTypeMap = new Map<string, ProductTypeGroup>();
        const specificProducts: Product[] = [];

        // Group results by product_type
        fuseResults.forEach((result) => {
            if (result.item.product_type) {
                const type = result.item.product_type;
                if (!productTypeMap.has(type)) {
                    productTypeMap.set(type, {
                        type,
                        count: 1,
                        sample: result.item,
                        isType: true,
                    });
                } else {
                    const entry = productTypeMap.get(type)!;
                    entry.count += 1;
                }
            }
        });

        // Get top specific products (always include some)
        specificProducts.push(
            ...fuseResults.slice(0, 5).map((result) => ({
                ...result.item,
                isType: false,
            })),
        );

        // Get product types (with sufficient items)
        const typeEntries = Array.from(productTypeMap.values())
            .filter((entry) => entry.count >= 2)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Limit to top 5 types

        // Mix results based on search complexity
        const isGenericSearch = searchQuery.trim().split(/\s+/).length === 1;

        if (isGenericSearch && typeEntries.length > 1) {
            // For generic searches, prioritize types
            return [...typeEntries, ...specificProducts].slice(0, 8);
        } else {
            // For specific searches, prioritize products
            return [...specificProducts, ...typeEntries].slice(0, 8);
        }
    }

    function sortResultsByRelevance(
        a: Fuse.FuseResult<Product>,
        b: Fuse.FuseResult<Product>,
        searchTerms: string[],
        qualifiers: string[],
    ): number {
        const aType = (a.item.product_type || "").toLowerCase();
        const bType = (b.item.product_type || "").toLowerCase();
        const aName = a.item.name.toLowerCase();
        const bName = b.item.name.toLowerCase();
        const searchLower = searchTerms.join(" ");

        // 1. Exact product type match with full query
        if (aType === searchLower && bType !== searchLower) return -1;
        if (aType !== searchLower && bType === searchLower) return 1;

        // 2. Product type contains any search term
        const aTypeMatch = searchTerms.some((term) => aType.includes(term));
        const bTypeMatch = searchTerms.some((term) => bType.includes(term));

        if (aTypeMatch && !bTypeMatch) return -1;
        if (!aTypeMatch && bTypeMatch) return 1;

        // 3. Exact word match in product name
        const aExactMatch = searchTerms.some(
            (term) =>
                aName.includes(` ${term} `) ||
                aName.startsWith(`${term} `) ||
                aName.endsWith(` ${term}`) ||
                aName === term,
        );

        const bExactMatch = searchTerms.some(
            (term) =>
                bName.includes(` ${term} `) ||
                bName.startsWith(`${term} `) ||
                bName.endsWith(` ${term}`) ||
                bName === term,
        );

        if (aExactMatch && !bExactMatch) return -1;
        if (!aExactMatch && bExactMatch) return 1;

        // 4. Qualifier logic
        if (qualifiers.length > 0) {
            const aMatchesQualifier = qualifiers.some((q) => aName.includes(q));
            const bMatchesQualifier = qualifiers.some((q) => bName.includes(q));

            if (aMatchesQualifier && !bMatchesQualifier) return -1;
            if (!aMatchesQualifier && bMatchesQualifier) return 1;
        }

        // 5. Fall back to original score
        return a.score! - b.score!;
    }

    function handleInput() {
        debouncedSearch();
    }

    function selectProduct(product: any) {
        showDropdown = false;
        const allFuseResults = fuse.search(searchQuery).map((r) => r.item);

        console.log("SELECTED PRODUCT:", {
            name: product.name,
            hash: product.hash,
            hashType: typeof product.hash,
            hasToString:
                product.hash && typeof product.hash.toString === "function",
        });

        dispatch("select", {
            hash: product.hash,
            productName: product.name,
            originalQuery: searchQuery,
            category: product.category,
            subcategory: product.subcategory,
            product_type: product.product_type,
            fuseResults: allFuseResults,
        });
    }

    function handleViewAllResults() {
        if (fuse && searchQuery) {
            const allFuseResults = fuse.search(searchQuery).map((r) => r.item);

            dispatch("viewAll", {
                query: searchQuery,
                fuseResults: allFuseResults,
                isViewAll: true,
            });
        } else {
            dispatch("viewAll", {
                query: searchQuery,
                isViewAll: true,
            });
        }
        showDropdown = false;
    }

    function handleTypeSelection(typeItem: any) {
        if (fuse && typeItem.type) {
            const allFuseResults = fuse
                .search(typeItem.type)
                .filter((r) => r.item.product_type === typeItem.type)
                .map((r) => r.item);

            dispatch("viewAll", {
                query: searchQuery,
                fuseResults: allFuseResults,
                isViewAll: true,
                selectedType: typeItem.type,
            });
            showDropdown = false;
        }
    }

    function handleEnterKey() {
        if (searchResults.length > 0) {
            handleViewAllResults();
        }
        showDropdown = false;
    }
</script>

<div class="search-container">
    <div class="search-input-container">
        <!-- Added Search icon from lucide -->
        <div class="search-icon">
            <Search size={18} color="#666666" />
        </div>
        <input
            type="text"
            placeholder="Search products..."
            bind:value={searchQuery}
            on:input={handleInput}
            on:keydown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                    handleEnterKey();
                }
            }}
        />
    </div>

    {#if showDropdown}
        <!-- Background overlay -->
        <div
            class="search-overlay"
            on:click={() => (showDropdown = false)}
        ></div>
        <div class="search-dropdown">
            <div class="results-container">
                {#if isLoading}
                    <div class="loading">Loading...</div>
                {:else if searchResults.length === 0}
                    <div class="no-results">No products found</div>
                {:else}
                    {#each searchResults as result}
                        {#if result.isType}
                            <!-- Product Type Item -->
                            <div
                                class="dropdown-item type-item"
                                on:click={() => handleTypeSelection(result)}
                            >
                                <div class="product-image">
                                    {#if result.sample?.image_url}
                                        <img
                                            src={result.sample.image_url}
                                            alt={result.type}
                                        />
                                    {/if}
                                </div>
                                <div class="product-name">
                                    <span class="product-type"
                                        >{result.type}</span
                                    >
                                    {searchQuery}
                                </div>
                            </div>
                        {:else}
                            <!-- Regular Product Item -->
                            <div
                                class="dropdown-item"
                                on:click={() => selectProduct(result)}
                            >
                                <div class="product-image">
                                    {#if result.image_url}
                                        <img
                                            src={result.image_url}
                                            alt={result.name}
                                        />
                                    {/if}
                                </div>
                                <div class="product-name">{result.name}</div>
                                <div class="product-price">
                                    ${result.price?.toFixed(2)}
                                </div>
                            </div>
                        {/if}
                    {/each}
                {/if}
            </div>
            <div class="view-all" on:click={handleViewAllResults}>
                View all results
            </div>
        </div>
    {/if}
</div>

<style>
    .search-container {
        position: relative;
        width: 100%;
        max-width: 600px;
    }

    .search-input-container {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
    }

    .search-icon {
        position: absolute;
        left: 12px;
        display: flex;
        align-items: center;
        pointer-events: none;
    }

    input {
        width: 100%;
        padding: 10px 15px 10px 38px; /* Added left padding for icon */
        border: 1px solid #ddd;
        border-radius: 20px;
        font-size: 14px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
        transition: box-shadow 0.2s ease;
    }

    input:hover,
    input:focus {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        outline: none;
    }

    .search-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        max-height: 500px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        z-index: 1001;
    }

    .results-container {
        flex: 1;
        overflow-y: auto;
    }

    .search-overlay {
        position: fixed;
        top: 60px; /* Below header */
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 900;
    }

    .dropdown-item {
        display: flex;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
    }

    .dropdown-item:hover {
        background-color: #f5f5f5;
    }

    .product-image {
        width: 40px;
        height: 40px;
        min-width: 40px;
        margin-right: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .product-image img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }

    .product-name {
        flex: 1;
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .product-price {
        margin-left: 10px;
        font-weight: bold;
        white-space: nowrap;
    }

    .view-all {
        padding: 10px;
        text-align: center;
        background-color: #f5f5f5;
        font-weight: bold;
        cursor: pointer;
    }

    .type-item {
        background-color: #f9f9f9;
    }

    .product-type {
        font-weight: bold;
    }

    .loading,
    .no-results {
        padding: 15px;
        text-align: center;
        color: #666;
    }
</style>
