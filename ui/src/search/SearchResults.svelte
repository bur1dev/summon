<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import ProductCard from "../ProductCard.svelte";
    import {
        ProductSelectionStrategy,
        SemanticSearchStrategy,
        TextSearchStrategy,
    } from "./search-strategy";
    import { SearchApiClient } from "./search-api";
    import { deduplicateProducts } from "./search-utils";
    import type { Product, SearchMethod } from "./search-types";

    export let store;
    export let query: string = "";
    export let selectedProductHash: any = null;
    export let productName: string = "";
    export let searchResults: Product[] = []; // Changed from fuseResults
    export let searchMethod: SearchMethod = ""; // Now uses the SearchMethod type

    let apiClient: SearchApiClient;
    let uiProps;
    $: uiProps = store?.uiProps;

    let isLoading = false;
    let displayedResults: Product[] = [];
    let totalResults = 0;
    let errorMessage = "";

    const dispatch = createEventDispatcher();

    onMount(() => {
        apiClient = new SearchApiClient(store);
        // Initial call to processAndDisplayResults will be triggered by the reactive block
    });

    async function processAndDisplayResults() {
        isLoading = true;
        errorMessage = "";

        console.log("[SearchResults] processAndDisplayResults triggered.", {
            query,
            selectedProductHashIsPresent: !!selectedProductHash,
            productName,
            searchResultsLength: searchResults?.length,
            searchMethod,
        });

        try {
            // If no apiClient, display error and return
            if (!apiClient) {
                errorMessage = "Search service not ready.";
                isLoading = false;
                return;
            }

            let result = { products: [] as Product[], total: 0 };

            // Select strategy based on search method and context
            if (searchMethod === "semantic") {
                // Semantic search results already provided
                result.products = deduplicateProducts(searchResults);
                result.total = result.products.length;
            } else if (
                searchMethod === "fuse_type_selection" ||
                searchMethod === "text"
            ) {
                // Text-based search
                const strategy = new TextSearchStrategy(searchResults, query);
                result = await strategy.execute();
            } else if (selectedProductHash) {
                // Product selection strategy
                const strategy = new ProductSelectionStrategy(
                    apiClient,
                    selectedProductHash,
                    query || productName,
                    searchResults,
                );
                result = await strategy.execute();
            } else if (query) {
                // Fallback to text strategy if we have a query but no specific method
                const strategy = new TextSearchStrategy(searchResults, query);
                result = await strategy.execute();
            }

            // Update displayedResults
            displayedResults = result.products;
            totalResults = result.total;

            // Show error message if no results found and we have a query
            if (displayedResults.length === 0 && (query || productName)) {
                errorMessage = `No products found for "${query || productName}"`;
            }
        } catch (error) {
            console.error("[SearchResults] Error processing results:", error);
            errorMessage = "An error occurred finding products.";
            displayedResults = [];
            totalResults = 0;
        } finally {
            isLoading = false;
        }
    }

    // Reactive statement to process results when inputs change
    $: if (
        query ||
        selectedProductHash ||
        searchResults ||
        searchMethod ||
        productName
    ) {
        if (apiClient !== undefined) {
            console.log(
                "[SearchResults] Reactive block triggered. Method:",
                searchMethod,
                "Query:",
                query,
                "Results length:",
                searchResults?.length,
            );
            processAndDisplayResults();
        } else {
            console.log(
                "[SearchResults] Reactive block triggered, but apiClient is undefined.",
            );
        }
    }
</script>

<div class="search-results">
    <h2>Search Results for "{query}"</h2>

    {#if isLoading}
        <div class="loading">Searching...</div>
    {:else if errorMessage}
        <div class="error">{errorMessage}</div>
    {:else if displayedResults.length === 0}
        <div class="no-results">No products found for "{query}"</div>
    {:else}
        <div class="products-grid">
            <!-- Using safe key for product hash -->
            {#each displayedResults as product (product.hash && typeof product.hash.toString === "function" ? product.hash.toString() : JSON.stringify(product.hash))}
                <ProductCard
                    {product}
                    on:reportCategory={(event) =>
                        dispatch("reportCategory", event.detail)}
                />
            {/each}
        </div>
    {/if}
</div>

<style>
    .search-results {
        width: 100%;
        padding: 20px 0;
    }

    h2 {
        font-size: 24px;
        margin-bottom: 20px;
    }

    .products-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
    }

    .loading,
    .no-results,
    .error {
        text-align: center;
        padding: 50px 0;
        color: #777;
    }

    .error {
        color: #d32f2f;
    }
</style>
