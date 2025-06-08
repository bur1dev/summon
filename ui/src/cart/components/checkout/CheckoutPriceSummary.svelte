<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { PriceService } from "../../../services/PriceService";

    // Props
    export let cartItems: any[] = [];
    export let isCheckingOut = false;

    // Calculate totals with tax using PriceService
    $: {
        let regularTotal = 0;
        let promoTotal = 0;

        cartItems.forEach((item: any) => {
            const product = item.productDetails;
            if (product) {
                const totals = PriceService.calculateItemTotal(
                    product,
                    item.quantity,
                );
                regularTotal += totals.regular;
                promoTotal += totals.promo;
            }
        });

        itemsTotal = regularTotal;
        itemsPromoTotal = promoTotal;
        estimatedTax = Math.round(itemsPromoTotal * 0.0775 * 100) / 100; // 7.75% CA sales tax on promo prices
        subtotal = itemsPromoTotal + estimatedTax;
        totalSavings = PriceService.calculateSavings(regularTotal, promoTotal);
    }

    // Variables for price calculation
    let itemsTotal = 0;
    let itemsPromoTotal = 0;
    let estimatedTax = 0;
    let subtotal = 0;
    let totalSavings = 0;

    // Event dispatcher
    const dispatch = createEventDispatcher();

    // Handle checkout button click
    function handlePlaceOrder() {
        dispatch("placeOrder");
    }
</script>

<!-- UPDATED: Price summary using PriceService -->
<div class="price-summary">
    <div class="price-row">
        <div class="price-label">Items Subtotal</div>
        <div class="price-value">
            {PriceService.formatTotal(itemsTotal)}
        </div>
    </div>

    {#if totalSavings > 0}
        <div class="price-row savings-row">
            <div class="price-label">Loyalty Card Savings</div>
            <div class="price-value savings-value">
                -{PriceService.formatSavings(totalSavings)}
            </div>
        </div>

        <div class="price-row promo-subtotal-row">
            <div class="price-label">Subtotal with Savings</div>
            <div class="price-value promo-value">
                {PriceService.formatTotal(itemsPromoTotal)}
            </div>
        </div>
    {/if}

    <div class="price-row">
        <div class="price-label">Estimated Tax</div>
        <div class="price-value">
            {PriceService.formatTotal(estimatedTax)}
        </div>
    </div>

    <div class="price-row total-row">
        <div class="price-label">Total</div>
        <div class="price-value">
            {PriceService.formatTotal(subtotal)}
        </div>
    </div>
</div>

<div class="checkout-actions">
    <button
        class="place-order-btn"
        on:click={handlePlaceOrder}
        disabled={isCheckingOut}
    >
        {#if isCheckingOut}
            Processing Order...
        {:else}
            Place Order
        {/if}
    </button>
</div>

<style>
    /* Price summary styling */
    .price-summary {
        background-color: var(--surface);
        border-radius: var(--card-border-radius);
        padding: var(--spacing-md);
        margin-bottom: var(--spacing-xl);
        box-shadow: var(--shadow-subtle);
    }

    .price-row {
        display: flex;
        justify-content: space-between;
        padding: var(--spacing-xs) 0;
        font-size: var(--font-size-sm);
        color: var(--text-primary);
    }

    .savings-row {
        color: var(--success);
    }

    .savings-value {
        color: var(--success);
        font-weight: var(--font-weight-semibold);
    }

    .promo-subtotal-row {
        border-top: var(--border-width-thin) solid var(--border);
        border-bottom: var(--border-width-thin) solid var(--border);
        margin: var(--spacing-xs) 0;
        padding: var(--spacing-sm) 0;
    }

    .promo-value {
        color: var(--primary);
        font-weight: var(--font-weight-semibold);
    }

    .total-row {
        border-top: var(--border-width-thin) solid var(--border);
        margin-top: var(--spacing-xs);
        padding-top: var(--spacing-sm);
        font-weight: var(--font-weight-semibold);
        font-size: var(--font-size-md);
        color: var(--text-primary);
    }

    .checkout-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .place-order-btn {
        width: 100%;
        height: var(--btn-height-lg);
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        border: none;
        color: var(--button-text);
        border-radius: var(--btn-border-radius);
        font-size: var(--btn-font-size-md);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        text-align: center;
        transition: var(--btn-transition);
        box-shadow: var(--shadow-button);
    }

    .place-order-btn:hover:not(:disabled) {
        background: linear-gradient(
            135deg,
            var(--primary-dark),
            var(--secondary)
        );
        transform: translateY(var(--hover-lift));
        box-shadow: var(--shadow-medium);
    }

    .place-order-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        background: var(--surface);
        color: var(--text-secondary);
        border: var(--border-width-thin) solid var(--border);
        box-shadow: none;
    }
</style>