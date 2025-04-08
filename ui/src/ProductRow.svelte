<script lang="ts">
    import NavigationArrows from "./NavigationArrows.svelte";
    import ProductCard from "./ProductCard.svelte";
    import { createEventDispatcher } from "svelte";

    // Required props
    export let title: string;
    export let identifier: string; // subcategory or productType name
    export let products = [];
    export let currentRanges;
    export let totalProducts = {};
    export let store;
    export let productCache;
    export let selectedCategory;
    export let selectedSubcategory;
    export let mainGridContainer;
    export let isProductType = false;
    export let onViewMore = () => {};
    export let action;

    const dispatch = createEventDispatcher();

    // Handle data loaded from navigation arrows
    function handleDataLoaded(event) {
        dispatch("dataLoaded", event.detail);
    }

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
        <span class="view-all-link" on:click|stopPropagation={onViewMore}>
            View More
        </span>
    </div>
    <div class="product-row-items" data-subcategory={identifier} use:action>
        <NavigationArrows
            direction="left"
            disabled={currentRanges[identifier]?.start === 0}
            {currentRanges}
            {identifier}
            {store}
            {productCache}
            {selectedCategory}
            {selectedSubcategory}
            {mainGridContainer}
            {isProductType}
            on:dataLoaded={handleDataLoaded}
        />

        {#if products && products.length > 0}
            {#each products as product (product.hash)}
                <ProductCard {product} on:reportCategory />
            {/each}
        {/if}

        <NavigationArrows
            direction="right"
            disabled={!products ||
                currentRanges[identifier]?.end >=
                    (totalProducts[identifier] || 0)}
            {currentRanges}
            {identifier}
            {store}
            {productCache}
            {selectedCategory}
            {selectedSubcategory}
            {mainGridContainer}
            {isProductType}
            on:dataLoaded={handleDataLoaded}
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
        border-radius: 15px;
        padding-top: 20px;
        padding-bottom: 20px;
        width: 100%;
    }

    .product-row-title {
        font-size: 30px;
        font-weight: bold;
        text-align: left;
        margin-bottom: 0px;
        padding-left: 15px;
        color: #343538;
    }

    .product-row-title b {
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

    .view-all-link {
        color: #343538;
        font-size: 20px;
        font-weight: bold;
        text-decoration: none;
        cursor: pointer;
        position: absolute;
        right: 20px;
        top: 10px;
    }

    .view-all-link:hover {
        text-decoration: underline;
    }

    .view-all-link::after {
        content: "›";
        margin-left: 4px;
        font-size: 16px;
    }

    .product-row-items {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
        grid-template-rows: 420px;
        gap: 0px;
        width: 100%;
        justify-content: start;
        max-height: 420px;
        overflow: hidden;
    }
</style>
