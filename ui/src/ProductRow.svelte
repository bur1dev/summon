<script lang="ts">
    import NavigationArrows from "./NavigationArrows.svelte";
    import ProductCard from "./ProductCard.svelte";
    import { createEventDispatcher } from "svelte";
    import { ChevronRight } from "lucide-svelte";

    // Required props
    export let title: string;
    export let identifier: string; // subcategory or productType name
    export let products = []; // This should be the exact slice of products to display
    export let currentRanges; // Contains { start, end } for this identifier
    export let totalProducts = {}; // Contains total estimate for this identifier's path
    export let store;
    export let selectedCategory;
    export let selectedSubcategory;
    export let mainGridContainer; // Passed down to NavigationArrows for capacity calculation
    export let isProductType = false;
    export let onViewMore = () => {};
    export let action; // For resize observer in ProductBrowser
    export let hasMore = {}; // New prop to store hasMore values from backend
    export let containerCapacity = 4; // New prop for dynamic capacity

    const dispatch = createEventDispatcher();

    // Forward report events from ProductCard
    function handleReportCategory(event) {
        dispatch("reportCategory", event.detail);
    }
</script>

<div class="product-row" id={identifier} use:action>
    <div class="section-header">
        <div class="product-row-title">
            <b>{title}</b>
        </div>
        <span
            class="view-all-link btn btn-text"
            on:click|stopPropagation={onViewMore}
        >
            View More
            <ChevronRight size={20} class="chevron-icon" />
        </span>
    </div>
    <!-- Pass identifier to data-subcategory for resize observer -->
    <div class="product-row-items" data-subcategory={identifier} use:action>
        <NavigationArrows
            direction="left"
            disabled={currentRanges[identifier]?.start === 0}
            hasMore={hasMore[identifier] ?? true}
            {currentRanges}
            {totalProducts}
            {identifier}
            {store}
            {selectedCategory}
            {selectedSubcategory}
            {mainGridContainer}
            {containerCapacity}
            {isProductType}
            on:dataLoaded
            on:boundariesInitialized
        />

        <!-- This loop iterates over the 'products' prop directly -->
        <!-- If 'products' becomes empty, this section will render nothing -->
        {#if products && products.length > 0}
            {#each products as product (product.hash)}
                <ProductCard
                    {product}
                    {selectedCategory}
                    {selectedSubcategory}
                    on:reportCategory={handleReportCategory}
                    on:productTypeSelect
                />
            {/each}
        {/if}

        <NavigationArrows
            direction="right"
            disabled={!products || !hasMore[identifier]}
            hasMore={hasMore[identifier] ?? true}
            {currentRanges}
            {totalProducts}
            {identifier}
            {store}
            {selectedCategory}
            {selectedSubcategory}
            {mainGridContainer}
            {containerCapacity}
            {isProductType}
            on:dataLoaded
            on:boundariesInitialized
        />
    </div>
</div>

<style>
    .product-row {
        position: relative;
        display: block;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: 290px;
        border: none;
        background-color: transparent;
        border-radius: var(--card-border-radius);
        padding-top: var(--spacing-lg);
        padding-bottom: var(--spacing-lg);
        width: 100%;
        margin-bottom: var(--spacing-lg);
        box-sizing: border-box;
        transition: var(--card-transition);
    }

    .product-row-title {
        font-size: 30px;
        font-weight: var(--font-weight-bold);
        text-align: left;
        margin-bottom: 0px;
        color: var(--text-primary);
    }

    .product-row-title b {
        color: var(--text-primary);
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline; /* Vertically align items along their text baseline */
        width: 100%;
        margin-bottom: var(--spacing-lg);
        position: relative; /* This is fine, can stay */
    }

    .view-all-link {
        font-size: var(--spacing-lg);
        font-weight: var(--font-weight-bold);
        text-decoration: none;
        cursor: pointer;
        /* position: absolute; -- REMOVED */
        /* right: var(--spacing-lg); -- REMOVED */
        /* top: var(--content-padding); -- REMOVED */
        display: flex; /* This is good for aligning the text and icon within the link */
        align-items: center; /* Aligns "View More" text and the chevron icon vertically */
        /* The .btn and .btn-text classes already provide padding and other styles */
    }

    :global(.chevron-icon) {
        transition: transform var(--transition-normal) ease;
    }

    .view-all-link:hover :global(.chevron-icon) {
        transform: translateX(2px);
    }

    .product-row-items {
        display: grid;
        grid-template-columns: repeat(auto-fill, 245px);
        grid-template-rows: 450px;
        gap: 0px;
        width: 100%;
        justify-content: space-between;
        max-height: 450px;
        overflow: visible;
        box-sizing: border-box;
        max-width: 100%;
    }
</style>
