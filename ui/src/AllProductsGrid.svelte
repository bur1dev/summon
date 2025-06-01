<script lang="ts">
    import { getContext, onMount, onDestroy, tick } from "svelte";
    import type { StoreContext } from "./store";
    import ProductCard from "./ProductCard.svelte";
    import { createEventDispatcher } from "svelte";
    import SortFilterDropdown from "./SortFilterDropdown.svelte";
    import {
        sortByStore,
        selectedBrandsStore,
        selectedOrganicStore,
    } from "./UiStateStore";
    import { shouldShowSortControls } from "./categoryUtils";
    import { useResizeObserver } from "./useResizeObserver";
    import { useVirtualGrid } from "./useVirtualGrid";

    export let selectedCategory: string;
    export let selectedSubcategory: string | null = null;
    export let selectedProductType: string | null = null;
    export let products: any[] = [];

    const { getStore } = getContext<StoreContext>("store");
    const store = getStore();
    const dispatch = createEventDispatcher();

    let productsGridRef: HTMLElement;
    let parentScrollContainer: HTMLElement | null = null;

    // Sort and filter state
    let sortDropdownOpen = false;
    let brandsDropdownOpen = false;
    let organicDropdownOpen = false;

    // Use resize observer for scroll container changes
    const scrollContainerResizeObserver = useResizeObserver(
        async () => {
            console.log(
                "AllProductsGrid: Global scroll container resized, updating virtual grid...",
            );
            if (virtualGrid && sortedFilteredProducts.length > 0) {
                virtualGrid.updateItems(sortedFilteredProducts);
            }
        },
        {
            debounceMs: 50,
            requiresTick: true,
        },
    );

    $: console.log(
        `Rendering ${$visibleIndices.length} of ${sortedFilteredProducts.length} products`,
    );

    // Use centralized category utility - fix null handling
    $: shouldShowControls = shouldShowSortControls(
        selectedCategory,
        selectedSubcategory || "",
        selectedProductType || "",
    );

    // Extract unique brands from products
    $: availableBrands = (() => {
        const brands = new Set<string>();
        products.forEach((product: any) => {
            if (product.brand && product.brand.trim()) {
                brands.add(product.brand.trim());
            }
        });
        return Array.from(brands).sort();
    })();

    // Apply sorting and filtering to products
    $: sortedFilteredProducts = (() => {
        let result = [...products];

        // Apply brand filter
        if ($selectedBrandsStore.size > 0) {
            result = result.filter(
                (product: any) =>
                    product.brand &&
                    $selectedBrandsStore.has(product.brand.trim()),
            );
        }

        // Apply organic filter
        if ($selectedOrganicStore === "organic") {
            result = result.filter(
                (product: any) => product.is_organic === true,
            );
        } else if ($selectedOrganicStore === "non-organic") {
            result = result.filter(
                (product: any) =>
                    product.is_organic === false ||
                    product.is_organic === undefined,
            );
        }

        // Apply sorting
        if ($sortByStore === "price-asc") {
            result.sort((a: any, b: any) => (a.price || 0) - (b.price || 0));
        } else if ($sortByStore === "price-desc") {
            result.sort((a: any, b: any) => (b.price || 0) - (a.price || 0));
        }

        return result;
    })();

    // Initialize virtual grid with empty items first
    const virtualGrid = useVirtualGrid({
        items: [],
        itemWidth: 245,
        itemHeight: 450,
    });

    // Get reactive values from virtual grid
    $: ({ visibleIndices, totalHeight } = virtualGrid);
    $: positionCache = virtualGrid.getPositionCache();

    // Update virtual grid when products change - FIXED
    $: if (virtualGrid && sortedFilteredProducts) {
        console.log(
            `Updating virtual grid with ${sortedFilteredProducts.length} products`,
        );
        virtualGrid.updateItems(sortedFilteredProducts);
    }

    // Event handlers for dropdowns
    function handleSortChange(event: CustomEvent<any>) {
        sortByStore.set(event.detail);
        sortDropdownOpen = false;
    }

    function handleBrandsChange(event: CustomEvent<any>) {
        selectedBrandsStore.set(event.detail);
        brandsDropdownOpen = false;
    }

    function handleOrganicChange(event: CustomEvent<any>) {
        selectedOrganicStore.set(event.detail);
        organicDropdownOpen = false;
    }

    function handleSortOpen() {
        brandsDropdownOpen = false;
        organicDropdownOpen = false;
    }

    function handleBrandsOpen() {
        sortDropdownOpen = false;
        organicDropdownOpen = false;
    }

    function handleOrganicOpen() {
        sortDropdownOpen = false;
        brandsDropdownOpen = false;
    }

    $: gridId = selectedProductType
        ? `all-products-${selectedProductType}`
        : `all-products-${selectedCategory}`;

    $: title =
        selectedProductType !== "All"
            ? selectedProductType
            : selectedSubcategory || "All Products";

    onMount(() => {
        // Find the global scroll container for resize observation
        const scrollContainer = document.querySelector(
            ".global-scroll-container",
        ) as HTMLElement | null;

        parentScrollContainer = scrollContainer;

        if (parentScrollContainer) {
            scrollContainerResizeObserver.observe(parentScrollContainer);
        } else {
            console.error(
                "Global scroll container not found! ResizeObserver for scrollbar changes will not be active.",
            );
        }

        return () => {
            scrollContainerResizeObserver.disconnect();
        };
    });

    onDestroy(() => {
        scrollContainerResizeObserver.disconnect();
    });
</script>

<div class="all-products-grid" id={gridId}>
    {#if title}
        <div class="section-header">
            <div class="all-products-title">
                <b>{title}</b>
            </div>
            {#if shouldShowControls}
                <div class="sort-filter-controls">
                    <SortFilterDropdown
                        type="sort"
                        currentSort={$sortByStore}
                        bind:isOpen={sortDropdownOpen}
                        on:sortChange={handleSortChange}
                        on:open={handleSortOpen}
                    />
                    <SortFilterDropdown
                        type="brands"
                        selectedBrands={$selectedBrandsStore}
                        {availableBrands}
                        bind:isOpen={brandsDropdownOpen}
                        on:brandsChange={handleBrandsChange}
                        on:open={handleBrandsOpen}
                    />
                    <SortFilterDropdown
                        type="organic"
                        selectedOrganic={$selectedOrganicStore}
                        bind:isOpen={organicDropdownOpen}
                        on:organicChange={handleOrganicChange}
                        on:open={handleOrganicOpen}
                    />
                </div>
            {/if}
        </div>
    {/if}
    <div
        class="products-grid"
        bind:this={productsGridRef}
        use:virtualGrid.action
    >
        {#if sortedFilteredProducts.length > 0}
            <div class="grid-container" style="height: {$totalHeight}px;">
                {#each $visibleIndices as index (sortedFilteredProducts[index]?.hash || index)}
                    {#if sortedFilteredProducts[index]}
                        <div
                            class="product-container"
                            style="position: absolute; top: {positionCache.get(
                                index,
                            )?.top ??
                                Math.floor(index / 1) *
                                    450}px; left: {positionCache.get(index)
                                ?.left ?? 0}px; width: 245px;"
                        >
                            <ProductCard
                                product={sortedFilteredProducts[index]}
                                on:reportCategory={(event) =>
                                    dispatch("reportCategory", event.detail)}
                                on:productTypeSelect
                            />
                        </div>
                    {/if}
                {/each}
            </div>
        {:else}
            <div class="loading-message">No products found</div>
        {/if}
    </div>
</div>

<style>
    .all-products-grid {
        padding-top: 20px;
        padding-bottom: 20px;
        width: 100%;
        box-sizing: border-box;
    }

    .all-products-title {
        font-size: 30px;
        font-weight: bold;
        text-align: left;
        margin-bottom: 0px;
        color: #343538;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-bottom: 20px;
        position: relative;
    }

    .sort-filter-controls {
        display: flex;
        gap: var(--spacing-sm);
        align-items: center;
    }

    .products-grid {
        width: 100%;
        position: relative;
        box-sizing: border-box;
        overflow: visible;
        max-width: 100%;
    }

    .grid-container {
        position: relative;
        width: 100%;
        overflow: visible;
        transform: translateZ(0);
        will-change: transform;
        backface-visibility: hidden;
        contain: layout size;
        perspective: 1000px;
        box-sizing: border-box;
        max-width: 100%;
    }

    .product-container {
        height: 100%;
        padding: 0;
        transform: translateZ(0);
        will-change: transform;
        box-sizing: border-box;
        overflow: visible;
    }

    .loading-message {
        padding: 20px;
        text-align: center;
        width: 100%;
        box-sizing: border-box;
    }

    :global(*) {
        outline: none !important;
    }
</style>
