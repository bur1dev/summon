<script lang="ts">
    import { PencilLine, Plus, Minus } from "lucide-svelte";
    import type { CartBusinessService } from "../../services/CartBusinessService";
    import { PriceService } from "../../../services/PriceService";
    import { CartInteractionService } from "../../services/CartInteractionService";
    import { getDisplayUnit, getCartItemKey } from "../../utils/cartHelpers";
    import ProductDetailModal from "../../../products/components/modal/ProductDetailModal.svelte";
    import { getContext } from "svelte";
    import type { Writable } from "svelte/store";

    // Props - simplified to match ProductCartItem pattern
    export let item: any;
    export let updatingProducts: Map<string, number>;

    // Get cart service from context like ProductCartItem
    const cartServiceStore =
        getContext<Writable<CartBusinessService | null>>("cartService");

    // State for modal
    let showModal = false;

    // Use cart helper for item key creation
    function getItemKey(item: any): string {
        return getCartItemKey(item.groupHash, item.productIndex);
    }

    // Use CartInteractionService for consistent behavior with ProductCartItem
    async function handleDecrementItem(item: any) {
        const itemKey = getItemKey(item);
        if (updatingProducts.has(itemKey)) return;

        await CartInteractionService.decrementItem(
            cartServiceStore,
            item.groupHash,
            item.productIndex,
            item.quantity,
            item.productDetails,
            item.note || undefined,
        );
    }

    async function handleIncrementItem(item: any) {
        const itemKey = getItemKey(item);
        if (updatingProducts.has(itemKey)) return;

        await CartInteractionService.incrementItem(
            cartServiceStore,
            item.groupHash,
            item.productIndex,
            item.quantity,
            item.productDetails,
            item.note || undefined,
        );
    }

    async function handleRemove(item: any) {
        await CartInteractionService.removeItem(
            cartServiceStore,
            item.groupHash,
            item.productIndex,
        );
    }

    // Returns true if a product is currently updating
    function isUpdating(groupHash: any, productIndex: any): boolean {
        const itemKey = getCartItemKey(groupHash, productIndex);
        return updatingProducts.has(itemKey);
    }

    // Use cart helper for display unit
    function getItemDisplayUnit(item: any): string {
        return getDisplayUnit(item.productDetails);
    }

    // Handle instructions click - opens ProductDetailModal
    function handleInstructionsClick() {
        showModal = true;
    }
</script>

<div class="order-item cart-item">
    <div class="item-image">
        {#if item.productDetails?.image_url}
            <img
                src={item.productDetails.image_url}
                alt={item.productDetails?.name || "Product"}
            />
        {/if}
    </div>

    <div class="item-content">
        <div class="item-left">
            <div class="item-name">
                {item.productDetails?.name || "Unknown Product"}
            </div>

            <!-- Price display using PriceService -->
            <div class="item-quantity-price">
                <span class="item-unit-price">
                    {PriceService.formatPriceWithUnit(
                        item.productDetails?.price || 0,
                        item.productDetails?.sold_by,
                    )}
                </span>
                {#if item.productDetails && PriceService.hasPromoPrice(item.productDetails)}
                    <span class="price-separator">/</span>
                    <span class="item-unit-price promo-price">
                        {PriceService.formatPriceWithUnit(
                            item.productDetails.promo_price,
                            item.productDetails?.sold_by,
                        )}
                    </span>
                {/if}
            </div>

            {#if item.note}
                <div class="item-note">
                    Shopper note: {item.note}
                </div>
            {/if}
            <button
                class="instructions-link"
                on:click={handleInstructionsClick}
            >
                <PencilLine size={14} />
                <span
                    >{item.note
                        ? "Edit instructions"
                        : "Add instructions"}</span
                >
            </button>
        </div>
        <div class="item-right">
            {#if $cartServiceStore}
                <div class="quantity-control">
                    <button
                        class="quantity-btn minus-btn"
                        on:click|stopPropagation={() =>
                            handleDecrementItem(item)}
                        disabled={isUpdating(item.groupHash, item.productIndex)}
                    >
                        <Minus size={14} />
                    </button>
                    <span class="quantity-display">
                        {isUpdating(item.groupHash, item.productIndex)
                            ? "..."
                            : item.quantity}
                        {getItemDisplayUnit(item)}
                    </span>
                    <button
                        class="quantity-btn plus-btn"
                        on:click|stopPropagation={() =>
                            handleIncrementItem(item)}
                        disabled={isUpdating(item.groupHash, item.productIndex)}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            {/if}

            <!-- Item totals using PriceService -->
            <div class="item-price">
                {#if item.productDetails}
                    {@const itemTotals = PriceService.calculateItemTotal(
                        item.productDetails,
                        item.quantity,
                    )}
                    {@const hasPromo = PriceService.hasPromoPrice(
                        item.productDetails,
                    )}

                    <span class="price-amount"
                        >{PriceService.formatTotal(itemTotals.regular)}</span
                    >
                    {#if hasPromo}
                        <span class="promo-amount"
                            >{PriceService.formatTotal(itemTotals.promo)}</span
                        >
                        {#if itemTotals.savings > 0}
                            <span class="item-savings"
                                >You save {PriceService.formatSavings(
                                    itemTotals.savings,
                                )}</span
                            >
                        {/if}
                    {/if}
                {/if}
            </div>

            {#if $cartServiceStore}
                <button
                    class="btn btn-text remove-item"
                    on:click|stopPropagation={() => handleRemove(item)}
                    disabled={isUpdating(item.groupHash, item.productIndex)}
                >
                    Remove
                </button>
            {/if}
        </div>
    </div>
</div>

<!-- ProductDetailModal for preference editing - same as ProductCartItem -->
<ProductDetailModal
    bind:isOpen={showModal}
    product={item.productDetails}
    groupHashBase64={item.groupHash}
    productIndex={item.productIndex}
    forceShowPreferences={true}
/>

<style>
    .order-item {
        display: flex;
        padding: var(--spacing-sm) 0;
        align-items: flex-start;
        border-bottom: var(--border-width-thin) solid var(--border);
    }

    .item-image {
        width: 70px;
        height: 70px;
        margin-right: var(--spacing-sm);
        flex-shrink: 0;
        border-radius: var(--card-border-radius);
    }

    .item-image img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: var(--btn-border-radius);
        background-color: var(--surface);
        padding: 4px;
        border-radius: var(--card-border-radius);
    }

    .item-content {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }

    .item-left {
        flex: 0 1 auto;
        margin-right: var(--spacing-lg);
        width: calc(100% - 140px);
        overflow: hidden;
    }

    .item-name {
        font-weight: var(--font-weight-semibold);
        margin-bottom: 4px;
        color: var(--text-primary);
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
        max-width: 100%;
    }

    /* Price display styling */
    .item-quantity-price {
        display: flex;
        font-size: var(--font-size-sm);
        gap: var(--spacing-xs);
        align-items: center;
        margin-bottom: 4px;
        color: var(--text-secondary);
    }

    .item-unit-price {
        color: var(--text-secondary);
    }

    .price-separator {
        margin: 0 4px;
        color: var(--text-secondary);
    }

    .promo-price {
        color: var(--primary);
        font-weight: var(--font-weight-semibold);
    }

    .item-note {
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        margin-top: 4px;
        margin-bottom: 4px;
        max-width: 100%;
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
        display: block;
        background-color: var(--surface);
        padding: 4px var(--spacing-xs);
        border-radius: 4px;
        border-left: var(--border-width) solid var(--primary);
    }

    .item-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        width: 120px;
        flex: 0 0 120px;
    }

    /* Item price styling */
    .item-price {
        text-align: right;
    }

    .price-amount {
        font-weight: var(--font-weight-semibold);
        font-size: var(--font-size-md);
        text-align: right;
        color: var(--text-primary);
        display: block;
    }

    .promo-amount {
        font-size: var(--font-size-sm);
        color: var(--primary);
        font-weight: var(--font-weight-semibold);
        display: block;
    }

    .item-savings {
        font-size: var(--font-size-sm);
        color: var(--success);
        font-weight: var(--font-weight-semibold);
        display: block;
    }

    .remove-item {
        color: var(--error);
        font-size: var(--font-size-sm);
        padding: 4px var(--spacing-xs);
    }

    .remove-item:hover {
        background-color: rgba(211, 47, 47, 0.1);
        text-decoration: underline;
        color: var(
            --error
        ); /* Override btn-text:hover which changes to primary-dark */
    }

    /* Use the same quantity control style as ProductCartItem */
    .quantity-control {
        width: 140px;
        height: var(--btn-height-sm);
        border-radius: 30px;
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        display: flex;
        justify-content: space-between;
        padding: 0;
        overflow: hidden;
        border: none;
        box-shadow: var(--shadow-button);
    }

    .quantity-btn {
        width: var(--btn-height-sm);
        height: var(--btn-height-sm);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--btn-transition);
        background-color: rgba(0, 0, 0, 0.15);
        border-radius: 50%;
    }

    .quantity-btn.minus-btn {
        margin-right: -5px;
    }

    .quantity-btn.plus-btn {
        margin-left: -5px;
    }

    .quantity-btn:hover {
        background-color: rgba(0, 0, 0, 0.3);
        transform: scale(var(--hover-scale-subtle));
    }

    :global(.quantity-btn svg) {
        color: var(--button-text);
        stroke: var(--button-text);
    }

    .quantity-btn:disabled {
        background-color: rgba(0, 0, 0, 0.1);
        cursor: not-allowed;
        opacity: 0.7;
    }

    :global(.quantity-btn:disabled svg) {
        color: var(--button-text);
        opacity: 0.5;
        stroke: var(--button-text);
    }

    .quantity-display {
        min-width: 60px;
        text-align: center;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--button-text);
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        padding: 0 var(--spacing-xs);
    }

    .instructions-link {
        background: transparent;
        border: none;
        color: var(--primary);
        font-size: var(--font-size-sm);
        cursor: pointer;
        padding: 4px var(--spacing-xs);
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
        border-radius: var(--btn-border-radius);
        transition: var(--btn-transition);
    }

    .instructions-link:hover {
        background-color: var(--surface);
        transform: translateY(var(--hover-lift));
    }
</style>
