<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import ProductCard from "../ProductCard.svelte";
    import {
        ProductSelectionStrategy,
        DirectSearchStrategy,
    } from "./search-strategy";
    import { SearchApiClient } from "./search-api";
    import { deduplicateProducts } from "./search-utils";
    import type { Product } from "./search-types";

    export let store;
    export let query = "";
    export let selectedProductHash = null;
    export let productName = "";
    export let fuseResults: Product[] = [];

    let apiClient: SearchApiClient;
    let uiProps;
    $: uiProps = store?.uiProps;

    let isLoading = false;
    let searchResults: Product[] = [];
    let totalResults = 0;
    let errorMessage = "";

    const dispatch = createEventDispatcher();

    onMount(() => {
        apiClient = new SearchApiClient(store);
        if (query || selectedProductHash || productName) {
            performSearch();
        }
    });

    // Main search function that orchestrates the search process
    async function performSearch() {
        if (!apiClient) return;
        if (
            !query?.trim() &&
            !productName &&
            !selectedProductHash &&
            !fuseResults?.length
        )
            return;

        if (selectedProductHash) {
            console.log("RECEIVED HASH:", {
                hash: selectedProductHash,
                type: typeof selectedProductHash,
                hasGroupHash:
                    selectedProductHash && selectedProductHash.groupHash,
                hasIndex:
                    selectedProductHash &&
                    typeof selectedProductHash.index === "number",
            });
        }

        isLoading = true;
        errorMessage = "";

        try {
            const searchMode = selectedProductHash ? "product" : "direct";

            console.log(`Search mode: ${searchMode}`, {
                query,
                productName,
                hasFuseResults: !!fuseResults?.length,
                fuseResultsCount: fuseResults?.length || 0,
            });

            let strategy;
            if (searchMode === "product") {
                strategy = new ProductSelectionStrategy(
                    apiClient,
                    selectedProductHash,
                    query || productName,
                    fuseResults,
                );
            } else {
                strategy = new DirectSearchStrategy(
                    apiClient,
                    query || productName,
                    fuseResults,
                );
            }

            const result = await strategy.execute();
            searchResults = result.products;
            totalResults = result.total;

            console.log(`Search complete: ${searchResults.length} results`);
        } catch (error) {
            console.error("Search error:", error);
            errorMessage = "An error occurred during search. Please try again.";

            // Fallback to fuseResults if available
            if (fuseResults && fuseResults.length > 0) {
                searchResults = deduplicateProducts(fuseResults);
                totalResults = searchResults.length;
                console.log(
                    `Using fallback results: ${searchResults.length} items`,
                );
            }
        } finally {
            isLoading = false;
        }
    }

    // Trigger search when relevant inputs change
    $: if (query || selectedProductHash || productName) {
        performSearch();
    }
</script>

<div class="search-results">
    <h2>Search Results for "{query}"</h2>

    {#if isLoading}
        <div class="loading">Searching...</div>
    {:else if errorMessage}
        <div class="error">{errorMessage}</div>
    {:else if searchResults.length === 0}
        <div class="no-results">No products found</div>
    {:else}
        <div class="products-grid">
            {#each searchResults as product (product.hash)}
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
