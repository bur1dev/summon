<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { PencilLine } from "lucide-svelte";
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

    // Track which items are being updated - using composite key for groupHash_productIndex
    let updatingProducts = new Map(); // Change from Set to Map to store timestamps

    // State for note editing
    let editingNoteForItem = null;
    let currentNote = "";
    let showNoteButtons = false;
    let noteChanged = false;

    // To detect new cart items
    let previousCartItems = [...cartItems];

    // Create a composite key for tracking updates
    function getItemKey(item) {
        return `${item.groupHash}_${item.productIndex}`;
    }

    // Watch for cart changes to clear updating status
    $: {
        // When cartItems changes, check if any updating products have been modified
        if (cartItems && cartItems.length > 0) {
            // For each updating product, check if quantity changed
            for (const [key, timestamp] of updatingProducts.entries()) {
                // Parse the key back into groupHash and productIndex
                const [groupHash, productIndexStr] = key.split("_");
                const productIndex = parseInt(productIndexStr);

                const oldItem = previousCartItems.find(
                    (item) =>
                        item.groupHash === groupHash &&
                        item.productIndex === productIndex,
                );
                const newItem = cartItems.find(
                    (item) =>
                        item.groupHash === groupHash &&
                        item.productIndex === productIndex,
                );

                // If quantity changed or update is older than 5 seconds, clear update status
                if (
                    !oldItem ||
                    !newItem ||
                    oldItem.quantity !== newItem.quantity ||
                    Date.now() - timestamp > 5000
                ) {
                    updatingProducts.delete(key);
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

    async function updateQuantity(groupHash, productIndex, newQuantity, note) {
        if (!cartService || newQuantity < 1) return;

        // Add to updating products with timestamp using composite key
        const itemKey = `${groupHash}_${productIndex}`;
        updatingProducts.set(itemKey, Date.now());

        try {
            await cartService.addToCart(
                groupHash,
                productIndex,
                newQuantity,
                note,
            );

            // Add a timeout as fallback to clear updating status
            setTimeout(() => {
                if (updatingProducts.has(itemKey)) {
                    updatingProducts.delete(itemKey);
                    // Force UI update
                    updatingProducts = new Map(updatingProducts);
                }
            }, 3000);
        } catch (error) {
            console.error("Error updating quantity:", error);
            // Clear updating status on error
            updatingProducts.delete(itemKey);
            // Force UI update
            updatingProducts = new Map(updatingProducts);
        }
    }

    // New function to remove item completely
    async function handleRemove(groupHash, productIndex) {
        if (!groupHash) return;

        const itemKey = `${groupHash}_${productIndex}`;
        if (!cartService || updatingProducts.has(itemKey)) return;

        // Mark as updating
        updatingProducts.set(itemKey, Date.now());

        try {
            // Set quantity to 0 to remove
            await cartService.addToCart(groupHash, productIndex, 0);
        } catch (error) {
            console.error("Error removing item:", error);
            // Clear updating status on error
            updatingProducts.delete(itemKey);
            // Force UI update
            updatingProducts = new Map(updatingProducts);
        }
    }

    function handleDecrementItem(item) {
        const itemKey = getItemKey(item);
        const isSoldByWeight = item.productDetails?.sold_by === "WEIGHT";
        const incrementValue = isSoldByWeight ? 0.25 : 1;

        if (item.quantity > incrementValue && !updatingProducts.has(itemKey)) {
            updateQuantity(
                item.groupHash,
                item.productIndex,
                item.quantity - incrementValue,
                item.note,
            );
        }
    }

    function handleIncrementItem(item) {
        const itemKey = getItemKey(item);
        const isSoldByWeight = item.productDetails?.sold_by === "WEIGHT";
        const incrementValue = isSoldByWeight ? 0.25 : 1;

        if (!updatingProducts.has(itemKey)) {
            updateQuantity(
                item.groupHash,
                item.productIndex,
                item.quantity + incrementValue,
                item.note,
            );
        }
    }

    // Returns true if a product is currently updating
    function isUpdating(groupHash, productIndex) {
        const itemKey = `${groupHash}_${productIndex}`;
        return updatingProducts.has(itemKey);
    }

    // Note editing functionality
    function startEditingNote(item) {
        editingNoteForItem = item;
        currentNote = item.note || "";
        showNoteButtons = false;
        noteChanged = false;
    }

    function closeNoteEdit() {
        editingNoteForItem = null;
        currentNote = "";
        showNoteButtons = false;
        noteChanged = false;
    }

    function handleNoteInput() {
        showNoteButtons = currentNote !== (editingNoteForItem?.note || "");
        noteChanged = currentNote !== (editingNoteForItem?.note || "");
    }

    async function saveNote() {
        if (!editingNoteForItem) return;

        try {
            await cartService.addToCart(
                editingNoteForItem.groupHash,
                editingNoteForItem.productIndex,
                editingNoteForItem.quantity,
                currentNote || undefined,
            );

            // Update the note in the local item
            const index = cartItems.findIndex(
                (item) =>
                    item.groupHash === editingNoteForItem.groupHash &&
                    item.productIndex === editingNoteForItem.productIndex,
            );

            if (index !== -1) {
                cartItems[index].note = currentNote || undefined;
            }

            closeNoteEdit();
        } catch (error) {
            console.error("Error saving note:", error);
        }
    }

    function cancelNote() {
        closeNoteEdit();
    }

    // Helper to determine display unit based on product type
    function getDisplayUnit(item) {
        return item.productDetails?.sold_by === "WEIGHT" ? "lb" : "ct";
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
                    {#each [...cartItems].sort((a, b) => a.groupHash.localeCompare(b.groupHash) || a.productIndex - b.productIndex) as item}
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

                            {#if editingNoteForItem && editingNoteForItem.groupHash === item.groupHash && editingNoteForItem.productIndex === item.productIndex}
                                <div class="note-edit-section">
                                    <div class="note-header">
                                        <h4>Your preferences</h4>
                                        <button
                                            class="close-note-button"
                                            on:click={cancelNote}
                                        >
                                            <svg
                                                width="20"
                                                height="20"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <line
                                                    x1="18"
                                                    y1="6"
                                                    x2="6"
                                                    y2="18"
                                                ></line>
                                                <line
                                                    x1="6"
                                                    y1="6"
                                                    x2="18"
                                                    y2="18"
                                                ></line>
                                            </svg>
                                        </button>
                                    </div>
                                    <p>Special instructions</p>
                                    <textarea
                                        bind:value={currentNote}
                                        on:input={handleNoteInput}
                                        placeholder="I would like my shopper to..."
                                        class="note-input {noteChanged
                                            ? 'active'
                                            : ''}"
                                        rows="3"
                                    ></textarea>
                                    {#if showNoteButtons}
                                        <div class="note-buttons">
                                            <button
                                                class="cancel-button"
                                                on:click={cancelNote}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                class="save-button"
                                                on:click={saveNote}
                                            >
                                                Save instructions
                                            </button>
                                        </div>
                                    {/if}
                                </div>
                            {:else}
                                <div class="item-content">
                                    <div class="item-left">
                                        <div class="item-name">
                                            {item.productDetails?.name ||
                                                "Unknown Product"}
                                        </div>
                                        <div class="item-quantity-price">
                                            <span class="item-quantity"
                                                >{item.quantity}×</span
                                            >
                                            <span class="item-unit-price">
                                                ${(
                                                    item.productDetails
                                                        ?.price || 0
                                                ).toFixed(2)}
                                                {item.productDetails
                                                    ?.sold_by === "WEIGHT"
                                                    ? "/lb"
                                                    : "each"}
                                            </span>
                                        </div>
                                        {#if item.note}
                                            <div class="item-note">
                                                Shopper note: {item.note}
                                            </div>
                                        {/if}
                                        <button
                                            class="instructions-link"
                                            on:click={() =>
                                                startEditingNote(item)}
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
                                        {#if cartService}
                                            <div class="quantity-control">
                                                <button
                                                    class="quantity-btn remove-btn"
                                                    on:click|stopPropagation={() =>
                                                        handleDecrementItem(
                                                            item,
                                                        )}
                                                    disabled={isUpdating(
                                                        item.groupHash,
                                                        item.productIndex,
                                                    )}
                                                >
                                                    -
                                                </button>
                                                <span class="quantity-display">
                                                    {isUpdating(
                                                        item.groupHash,
                                                        item.productIndex,
                                                    )
                                                        ? "..."
                                                        : item.quantity}
                                                    {getDisplayUnit(item)}
                                                </span>
                                                <button
                                                    class="quantity-btn add-btn"
                                                    on:click|stopPropagation={() =>
                                                        handleIncrementItem(
                                                            item,
                                                        )}
                                                    disabled={isUpdating(
                                                        item.groupHash,
                                                        item.productIndex,
                                                    )}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        {/if}
                                        <div class="item-price">
                                            ${(
                                                (item.productDetails?.price ||
                                                    0) * item.quantity
                                            ).toFixed(2)}
                                        </div>
                                        {#if cartService}
                                            <button
                                                class="remove-item"
                                                on:click|stopPropagation={() =>
                                                    handleRemove(
                                                        item.groupHash,
                                                        item.productIndex,
                                                    )}
                                                disabled={isUpdating(
                                                    item.groupHash,
                                                    item.productIndex,
                                                )}
                                            >
                                                Remove
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
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
        color: rgb(61, 61, 61);
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
        align-items: flex-start;
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
        display: flex;
        justify-content: space-between;
        overflow: hidden;
    }

    .item-left {
        flex: 0 1 auto;
        margin-right: 20px;
        width: calc(100% - 140px);
        overflow: hidden;
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

    .item-note {
        font-size: 13px;
        color: #666;
        margin-top: 4px;
        margin-bottom: 4px;
        max-width: 100%;
        word-break: break-all;
        overflow-wrap: break-word;
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .item-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        width: 120px;
        flex: 0 0 120px;
    }

    .item-price {
        font-weight: 600;
        font-size: 15px;
        text-align: right;
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

    .checkout-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .place-order-btn {
        width: 100%;
        padding: 14px;
        background: rgb(61, 61, 61);
        border: none;
        color: white;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        transition: background-color 0.2s;
    }

    .place-order-btn:hover:not(:disabled) {
        background-color: rgb(98, 98, 98);
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

    .instructions-link {
        background: transparent;
        border: none;
        color: rgb(61, 61, 61);
        font-size: 13px;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
    }

    .instructions-link:hover {
        text-decoration: underline;
    }

    .note-edit-section {
        flex: 1;
        background: #f7f7f7;
        border-radius: 8px;
        padding: 16px;
    }

    .note-edit-section h4 {
        font-size: 18px;
        font-weight: 600;
        margin: 0 0 8px 0;
    }

    .note-edit-section p {
        font-size: 14px;
        margin: 0 0 8px 0;
    }

    .note-input {
        width: 100%;
        min-height: 80px;
        padding: 12px;
        border: 1px solid #c0c0c0;
        border-radius: 12px;
        font-size: 14px;
        background: #ffffff;
        resize: vertical;
        line-height: 1.4;
    }

    .note-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }

    .close-note-button {
        background: transparent;
        border: none;
        cursor: pointer;
        color: #666;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
    }

    .close-note-button:hover {
        background: #e0e0e0;
    }

    .note-input:focus {
        outline: none;
        border-color: #3f8ae0;
    }

    .note-input.active {
        border-color: #3f8ae0;
    }

    .note-input::placeholder {
        color: #999;
    }

    .note-buttons {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-top: 16px;
    }

    .cancel-button,
    .save-button {
        padding: 10px 20px;
        border-radius: 30px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        min-width: 120px;
    }

    .cancel-button {
        background: #e0e0e0;
        border: none;
        color: #343538;
    }

    .save-button {
        background: rgb(61, 61, 61);
        border: none;
        color: white;
    }
</style>
