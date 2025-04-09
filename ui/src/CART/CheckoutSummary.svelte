<!-- Adding the Remove button under the price in OrderDetails -->
<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import type { Address } from "./AddressService";
    import type { DeliveryTimeSlot } from "./SimpleCartService";

    // Props
    export let cartItems = [];
    export let cartTotal = 0;
    export let address: Address;
    export let deliveryInstructions: string = "";
    export let deliveryTime: { date: Date; display: string };
    export let isCheckingOut = false;
    export let cartService = null;

    // Calculate total with tax
    $: itemsTotal = cartTotal;
    $: estimatedTax = Math.round(itemsTotal * 0.0775 * 100) / 100; // 7.75% CA sales tax
    $: subtotal = itemsTotal + estimatedTax;

    // Track which items are being updated
    let updatingProducts = new Map(); // Change from Set to Map to store timestamps

    // To detect new cart items
    let previousCartItems = [...cartItems];

    // Watch for cart changes to clear updating status
    $: {
        // When cartItems changes, check if any updating products have been modified
        if (cartItems && cartItems.length > 0) {
            // For each updating product, check if quantity changed
            for (const [hash, timestamp] of updatingProducts.entries()) {
                const oldItem = previousCartItems.find(
                    (item) => item.productHash === hash,
                );
                const newItem = cartItems.find(
                    (item) => item.productHash === hash,
                );

                // If quantity changed or update is older than 5 seconds, clear update status
                if (
                    !oldItem ||
                    !newItem ||
                    oldItem.quantity !== newItem.quantity ||
                    Date.now() - timestamp > 5000
                ) {
                    updatingProducts.delete(hash);
                }
            }

            // Update previous cart items for next comparison
            previousCartItems = [...cartItems];
        }
    }

    // Event dispatcher
    const dispatch = createEventDispatcher();

    // Handle checkout button click
    function handlePlaceOrder() {
        dispatch("placeOrder");
    }

    // Handle edit actions
    function editDeliveryAddress() {
        dispatch("editAddress");
    }

    function editDeliveryTime() {
        dispatch("editTime");
    }

    async function updateQuantity(productHash, newQuantity) {
        if (!cartService || newQuantity < 1) return;

        // Add to updating products with timestamp
        updatingProducts.set(productHash, Date.now());

        try {
            await cartService.addToCart(productHash, newQuantity);

            // Add a timeout as fallback to clear updating status
            setTimeout(() => {
                if (updatingProducts.has(productHash)) {
                    updatingProducts.delete(productHash);
                    // Force UI update
                    updatingProducts = new Map(updatingProducts);
                }
            }, 3000);
        } catch (error) {
            console.error("Error updating quantity:", error);
            // Clear updating status on error
            updatingProducts.delete(productHash);
            // Force UI update
            updatingProducts = new Map(updatingProducts);
        }
    }

    // New function to remove item completely
    async function handleRemove(productHash) {
        if (!cartService || updatingProducts.has(productHash)) return;

        // Mark as updating
        updatingProducts.set(productHash, Date.now());

        try {
            // Set quantity to 0 to remove
            await cartService.addToCart(productHash, 0);
        } catch (error) {
            console.error("Error removing item:", error);
            // Clear updating status on error
            updatingProducts.delete(productHash);
            // Force UI update
            updatingProducts = new Map(updatingProducts);
        }
    }

    function handleDecrementItem(item) {
        if (item.quantity > 1 && !updatingProducts.has(item.productHash)) {
            updateQuantity(item.productHash, item.quantity - 1);
        }
    }

    function handleIncrementItem(item) {
        if (!updatingProducts.has(item.productHash)) {
            updateQuantity(item.productHash, item.quantity + 1);
        }
    }

    // Returns true if a product is currently updating
    function isUpdating(productHash) {
        return updatingProducts.has(productHash);
    }
</script>

<div class="checkout-summary">
    <div class="checkout-summary-header">
        <h2>Order Summary</h2>
    </div>

    <div class="summary-content">
        <div class="summary-sections">
            <div class="summary-section">
                <div class="section-header">
                    <h3>Delivery Address</h3>
                    <button class="edit-button" on:click={editDeliveryAddress}
                        >Edit</button
                    >
                </div>
                <div class="address-details">
                    <div class="address-line">
                        {address.street}
                        {#if address.unit}
                            <span class="unit">{address.unit}</span>
                        {/if}
                    </div>
                    <div class="address-line">
                        {address.city}, {address.state}
                        {address.zip}
                    </div>
                    {#if deliveryInstructions}
                        <div class="delivery-instructions">
                            <span class="instructions-label">Instructions:</span
                            >
                            {deliveryInstructions}
                        </div>
                    {/if}
                </div>
            </div>

            <div class="summary-section">
                <div class="section-header">
                    <h3>Delivery Time</h3>
                    <button class="edit-button" on:click={editDeliveryTime}
                        >Edit</button
                    >
                </div>
                <div class="time-details">
                    <div class="time-date">
                        {deliveryTime.date.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                        })}
                    </div>
                    <div class="time-slot">{deliveryTime.display}</div>
                </div>
            </div>

            <div class="summary-section">
                <h3>Order Details</h3>
                <div class="order-items">
                    {#each [...cartItems].sort( (a, b) => a.productHash.localeCompare(b.productHash), ) as item}
                        <div class="order-item">
                            <div class="item-image">
                                {#if item.productDetails?.image_url}
                                    <img
                                        src={item.productDetails.image_url}
                                        alt={item.productDetails?.name ||
                                            "Product"}
                                    />
                                {/if}
                            </div>
                            <div class="item-content">
                                <div class="item-name">
                                    {item.productDetails?.name || "Product"}
                                </div>
                                <div class="item-quantity-price">
                                    <span class="item-quantity"
                                        >{item.quantity}×</span
                                    >
                                    <span class="item-unit-price">
                                        ${(
                                            item.productDetails?.price || 0
                                        ).toFixed(2)} each
                                    </span>
                                </div>
                                {#if cartService}
                                    <div class="quantity-control">
                                        <button
                                            class="quantity-btn remove-btn"
                                            on:click|stopPropagation={() =>
                                                handleDecrementItem(item)}
                                            disabled={isUpdating(
                                                item.productHash,
                                            )}
                                        >
                                            -
                                        </button>
                                        <span class="quantity-display">
                                            {isUpdating(item.productHash)
                                                ? "..."
                                                : item.quantity} ct
                                        </span>
                                        <button
                                            class="quantity-btn add-btn"
                                            on:click|stopPropagation={() =>
                                                handleIncrementItem(item)}
                                            disabled={isUpdating(
                                                item.productHash,
                                            )}
                                        >
                                            +
                                        </button>
                                    </div>
                                {/if}
                            </div>
                            <div class="item-price-column">
                                <div class="item-price">
                                    ${(
                                        (item.productDetails?.price || 0) *
                                        item.quantity
                                    ).toFixed(2)}
                                </div>
                                {#if cartService}
                                    <button
                                        class="remove-item"
                                        on:click|stopPropagation={() =>
                                            handleRemove(item.productHash)}
                                        disabled={isUpdating(item.productHash)}
                                    >
                                        Remove
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <div class="price-summary">
            <div class="price-row">
                <div class="price-label">Items Subtotal</div>
                <div class="price-value">${itemsTotal.toFixed(2)}</div>
            </div>

            <div class="price-row">
                <div class="price-label">Estimated Tax</div>
                <div class="price-value">${estimatedTax.toFixed(2)}</div>
            </div>

            <div class="price-row total-row">
                <div class="price-label">Total</div>
                <div class="price-value">${subtotal.toFixed(2)}</div>
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
    </div>
</div>

<style>
    .checkout-summary {
        background: white;
        border-radius: 8px;
        width: 100%;
    }

    .checkout-summary-header {
        padding: 16px;
        border-bottom: 1px solid #f0f0f0;
    }

    .checkout-summary-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
    }

    .summary-content {
        padding: 16px;
    }

    .summary-sections {
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-bottom: 24px;
    }

    .summary-section {
        border-bottom: 1px solid #f0f0f0;
        padding-bottom: 16px;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }

    .section-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }

    .edit-button {
        background: transparent;
        border: none;
        color: #1a8b51;
        font-size: 14px;
        cursor: pointer;
        padding: 4px 8px;
    }

    .edit-button:hover {
        text-decoration: underline;
    }

    .address-details,
    .time-details {
        font-size: 14px;
        color: #333;
        line-height: 1.5;
    }

    .address-line {
        margin-bottom: 4px;
    }

    .delivery-instructions {
        margin-top: 8px;
        font-size: 13px;
        color: #555;
        font-style: italic;
    }

    .instructions-label {
        font-weight: 500;
        margin-right: 4px;
    }

    .time-date {
        font-weight: 500;
        margin-bottom: 4px;
    }

    .order-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .order-item {
        display: flex;
        padding: 10px 0;
        align-items: center;
        border-bottom: 1px solid #f0f0f0;
    }

    .item-image {
        width: 50px;
        height: 50px;
        margin-right: 12px;
        flex-shrink: 0;
    }

    .item-image img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 4px;
    }

    .item-content {
        flex: 1;
        min-width: 0;
    }

    .item-name {
        font-weight: 500;
        margin-bottom: 4px;
    }

    .item-quantity-price {
        display: flex;
        font-size: 13px;
        color: #666;
        gap: 8px;
    }

    .item-quantity {
        color: #555;
    }

    .item-price-column {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        margin-left: 12px;
    }

    .item-price {
        font-weight: 600;
        font-size: 15px;
        text-align: right;
        margin-bottom: 6px;
    }

    .remove-item {
        background: transparent;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        text-decoration: underline;
    }

    .remove-item:hover {
        color: #333;
    }

    .price-summary {
        background-color: #f9f9f9;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 24px;
    }

    .price-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        font-size: 14px;
    }

    .total-row {
        border-top: 1px solid #e0e0e0;
        margin-top: 8px;
        padding-top: 12px;
        font-weight: 600;
        font-size: 16px;
    }

    .strikethrough {
        text-decoration: line-through;
        margin-right: 4px;
        color: #999;
    }

    .checkout-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .place-order-btn {
        width: 100%;
        padding: 16px;
        background-color: #1a8b51;
        border: 2px solid rgb(32, 200, 51);
        color: white;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .place-order-btn:hover:not(:disabled) {
        background-color: #156e40;
    }

    .place-order-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .quantity-control {
        display: flex;
        align-items: center;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        overflow: hidden;
        height: 36px;
        margin-top: 8px;
        width: fit-content;
    }

    .quantity-btn {
        width: 36px;
        height: 36px;
        background: white;
        border: none;
        font-size: 18px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .quantity-btn:hover {
        background: #f5f5f5;
    }

    .quantity-display {
        min-width: 40px;
        text-align: center;
        font-size: 14px;
    }
</style>
