<script lang="ts">
    import { createEventDispatcher } from "svelte";
    
    const dispatch = createEventDispatcher();
    
    export let product: any;
    export let selectedCategory: string = "";
    export let selectedSubcategory: string = "";

    function handleShopAllClick() {
        const productType = product.product_type || product.category;

        const categoryToUse = selectedCategory || product.category;
        const subcategoryToUse = selectedSubcategory || product.subcategory;

        if (categoryToUse && subcategoryToUse) {
            dispatch("productTypeSelect", {
                category: categoryToUse,
                subcategory: subcategoryToUse,
                productType,
            });
        } else {
            dispatch("productTypeSelect", {
                productType,
            });
        }
        dispatch("close");
    }

    function handleShopAllKeydown(event: KeyboardEvent) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleShopAllClick();
        }
    }
</script>

<div class="product-info">
    <div class="stock-status">
        {#if product.stocks_status === "HIGH"}
            <span class="stock-high">Many in stock</span>
        {:else if product.stocks_status === "LOW"}
            <span class="stock-low">Low stock</span>
        {:else}
            <span class="stock-out">Maybe out</span>
        {/if}
    </div>

    <h1 id="product-title" class="product-title">
        {product.name}
    </h1>
    
    <div
        class="shop-all btn btn-text"
        role="button"
        tabindex="0"
        on:click|stopPropagation={handleShopAllClick}
        on:keydown={handleShopAllKeydown}
    >
        Shop all {selectedSubcategory || product.subcategory
            ? (selectedSubcategory || product.subcategory) + "/"
            : ""}{product.product_type || product.category}
    </div>

    <div class="product-details">
        <h3>Details</h3>
        <div class="details-content">
            <p>{product.size || "1 each"}</p>
        </div>
    </div>
</div>

<style>
    .product-info {
        display: flex;
        flex-direction: column;
    }

    .stock-status {
        font-size: var(--font-size-sm);
        margin-bottom: var(--spacing-sm);
    }

    .stock-high {
        color: var(--success);
    }

    .stock-low {
        color: var(--warning);
    }

    .stock-out {
        color: var(--error);
    }

    .product-title {
        font-size: 28px;
        font-weight: var(--font-weight-semibold);
        margin: 0 0 var(--spacing-sm) 0;
        color: var(--text-primary);
        line-height: 1.2;
    }

    .shop-all {
        font-size: var(--spacing-lg);
        font-weight: var(--font-weight-bold);
        margin-bottom: var(--spacing-md);
        cursor: pointer;
        padding-left: 1px;
        justify-content: flex-start;
    }

    .product-details {
        margin-top: var(--spacing-md);
        border-top: var(--border-width-thin) solid var(--border);
        padding-top: var(--spacing-md);
    }

    .product-details h3 {
        font-size: 17px;
        font-weight: var(--font-weight-semibold);
        margin: 0 0 var(--spacing-sm) 0;
        color: var(--text-primary);
        cursor: pointer;
    }

    .details-content {
        font-size: 15px;
        color: var(--text-secondary);
    }
</style>