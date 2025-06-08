<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { PencilLine, Plus, Minus, X, Save } from "lucide-svelte";
    import type { Address } from "../services/AddressService";
    import type {
        CartBusinessService,
        DeliveryTimeSlot,
    } from "../services/CartBusinessService";
    import { PriceService } from "../services/PriceService";
    import { CartInteractionService } from "../services/CartInteractionService";
    import { PreferencesService } from "../services/PreferencesService";
    import {
        getIncrementValue,
        getDisplayUnit,
        isSoldByWeight,
        getCartItemKey,
    } from "../utils/cartHelpers";

    // Props
    export let cartItems: any[] = [];
    export let address: Address;
    export let deliveryInstructions: string = "";
    export let deliveryTime: { date: Date; display: string };
    export let isCheckingOut = false;
    export let cartService: CartBusinessService | null = null;

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

    // Track which items are being updated - using composite key for groupHash_productIndex
    let updatingProducts = new Map<string, number>(); // Change from Set to Map to store timestamps

    // State for note editing
    let editingNoteForItem: any = null;
    let currentNote = "";
    let showNoteButtons = false;
    let noteChanged = false;

    // Preference state - derived from service store when editing
    let savePreference = false;
    let existingPreference: any = null;
    let loadingPreference = false;

    // Get preference store for currently editing item
    $: editingPreferenceStore = editingNoteForItem ? 
        PreferencesService.getPreferenceStore(editingNoteForItem.groupHash, editingNoteForItem.productIndex) : null;
    
    // Derive preference state from service store
    $: if (editingPreferenceStore && $editingPreferenceStore) {
        loadingPreference = $editingPreferenceStore.loading;
        existingPreference = $editingPreferenceStore.preference;
        savePreference = $editingPreferenceStore.savePreference;
    }

    // To detect new cart items
    let previousCartItems: any[] = [...cartItems];

    // Use cart helper for item key creation
    function getItemKey(item: any): string {
        return getCartItemKey(item.groupHash, item.productIndex);
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
                    (item: any) =>
                        item.groupHash === groupHash &&
                        item.productIndex === productIndex,
                );
                const newItem = cartItems.find(
                    (item: any) =>
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

    async function updateQuantity(
        groupHash: any,
        productIndex: any,
        newQuantity: any,
        note: any,
    ) {
        if (newQuantity < 1) return;

        // Add to updating products with timestamp using cart helper
        const itemKey = getCartItemKey(groupHash, productIndex);
        updatingProducts.set(itemKey, Date.now());

        try {
            // Use cartService directly since it's passed as prop
            if (!cartService) {
                updatingProducts.delete(itemKey);
                updatingProducts = new Map(updatingProducts);
                return;
            }

            await cartService.addToCart(
                groupHash,
                productIndex,
                newQuantity,
                note,
            );

            const success = true;

            if (!success) {
                updatingProducts.delete(itemKey);
                updatingProducts = new Map(updatingProducts);
                return;
            }

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
    async function handleRemove(groupHash: any, productIndex: any) {
        if (!groupHash) return;

        const itemKey = getCartItemKey(groupHash, productIndex);
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

    function handleDecrementItem(item: any) {
        const itemKey = getItemKey(item);
        const incrementValue = getIncrementValue(item.productDetails);

        if (item.quantity > incrementValue && !updatingProducts.has(itemKey)) {
            updateQuantity(
                item.groupHash,
                item.productIndex,
                item.quantity - incrementValue,
                item.note,
            );
        }
    }

    function handleIncrementItem(item: any) {
        const itemKey = getItemKey(item);
        const incrementValue = getIncrementValue(item.productDetails);

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
    function isUpdating(groupHash: any, productIndex: any): boolean {
        const itemKey = getCartItemKey(groupHash, productIndex);
        return updatingProducts.has(itemKey);
    }

    // Note editing functionality
    async function startEditingNote(item: any) {
        editingNoteForItem = item;
        currentNote = item.note || "";
        showNoteButtons = false;
        noteChanged = false;

        // Load existing preference data using the service
        if (cartService) {
            await PreferencesService.loadPreference(cartService, item.groupHash, item.productIndex);
        }
    }

    function closeNoteEdit() {
        editingNoteForItem = null;
        currentNote = "";
        showNoteButtons = false;
        noteChanged = false;
        // Note: preference state is automatically cleaned up when editingPreferenceStore becomes null
    }

    function handleNoteInput() {
        showNoteButtons = currentNote !== (editingNoteForItem?.note || "");
        noteChanged = currentNote !== (editingNoteForItem?.note || "");
    }

    // Save note function with preference handling
    async function saveNote() {
        if (!editingNoteForItem) return;

        try {
            await cartService!.addToCart(
                editingNoteForItem.groupHash,
                editingNoteForItem.productIndex,
                editingNoteForItem.quantity,
                currentNote || undefined,
            );

            // Update the note in the local item
            const index = cartItems.findIndex(
                (item: any) =>
                    item.groupHash === editingNoteForItem.groupHash &&
                    item.productIndex === editingNoteForItem.productIndex,
            );

            if (index !== -1) {
                cartItems[index].note = currentNote || undefined;
            }

            // Save or delete preference based on toggle state using service
            if (savePreference && currentNote && currentNote.trim()) {
                await PreferencesService.savePreference(
                    cartService!,
                    editingNoteForItem.groupHash,
                    editingNoteForItem.productIndex,
                    currentNote.trim()
                );
            } else if (!savePreference && existingPreference) {
                await PreferencesService.deletePreference(
                    cartService!,
                    existingPreference.hash,
                    editingNoteForItem.groupHash,
                    editingNoteForItem.productIndex
                );
            }

            closeNoteEdit();
        } catch (error) {
            console.error("Error saving note:", error);
        }
    }

    function cancelNote() {
        closeNoteEdit();
    }

    // Toggle preference saving based on checkbox
    function handleSavePreferenceToggle(e: Event) {
        const target = e.target as HTMLInputElement;
        savePreference = target.checked;

        // Update service state
        if (editingNoteForItem) {
            PreferencesService.updateSavePreference(
                editingNoteForItem.groupHash,
                editingNoteForItem.productIndex,
                savePreference
            );
        }

        // If toggle turned off and there's an existing preference, show delete button
        showNoteButtons =
            savePreference !== (existingPreference !== null) || noteChanged;
    }

    // Use cart helper for display unit
    function getItemDisplayUnit(item: any): string {
        return getDisplayUnit(item.productDetails);
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

                            <div class="content-container">
                                <div
                                    class="note-edit-section"
                                    class:active={editingNoteForItem &&
                                        editingNoteForItem.groupHash ===
                                            item.groupHash &&
                                        editingNoteForItem.productIndex ===
                                            item.productIndex}
                                >
                                    <div class="note-header">
                                        <h4>Your preferences</h4>
                                        <button
                                            class="close-note-button"
                                            on:click={cancelNote}
                                        >
                                            <X size={20} />
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

                                    <!-- Preference toggle -->
                                    <div class="save-preference-toggle">
                                        <label class="toggle-container">
                                            <input
                                                type="checkbox"
                                                bind:checked={savePreference}
                                                on:change={handleSavePreferenceToggle}
                                                disabled={loadingPreference}
                                            />
                                            <span class="toggle-text">
                                                {#if loadingPreference}
                                                    Loading...
                                                {:else}
                                                    Remember my preferences for
                                                    next time
                                                {/if}
                                            </span>
                                            {#if existingPreference}
                                                <span class="saved-badge">
                                                    <Save size={12} />
                                                    Saved
                                                </span>
                                            {/if}
                                        </label>
                                    </div>

                                    <div
                                        class="note-buttons"
                                        class:visible={showNoteButtons}
                                    >
                                        <button
                                            class="cancel-button"
                                            on:click={cancelNote}>Cancel</button
                                        >
                                        <button
                                            class="save-button"
                                            on:click={saveNote}
                                            >Save instructions</button
                                        >
                                    </div>
                                </div>

                                <div
                                    class="item-content"
                                    class:hidden={editingNoteForItem &&
                                        editingNoteForItem.groupHash ===
                                            item.groupHash &&
                                        editingNoteForItem.productIndex ===
                                            item.productIndex}
                                >
                                    <div class="item-left">
                                        <div class="item-name">
                                            {item.productDetails?.name ||
                                                "Unknown Product"}
                                        </div>

                                        <!-- UPDATED: Price display using PriceService -->
                                        <div class="item-quantity-price">
                                            <span class="item-unit-price">
                                                {PriceService.formatPriceWithUnit(
                                                    item.productDetails
                                                        ?.price || 0,
                                                    item.productDetails
                                                        ?.sold_by,
                                                )}
                                            </span>
                                            {#if PriceService.hasPromoPrice(item.productDetails)}
                                                <span class="price-separator"
                                                    >/</span
                                                >
                                                <span
                                                    class="item-unit-price promo-price"
                                                >
                                                    {PriceService.formatPriceWithUnit(
                                                        item.productDetails
                                                            .promo_price,
                                                        item.productDetails
                                                            ?.sold_by,
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
                                                    class="quantity-btn minus-btn"
                                                    on:click|stopPropagation={() =>
                                                        handleDecrementItem(
                                                            item,
                                                        )}
                                                    disabled={isUpdating(
                                                        item.groupHash,
                                                        item.productIndex,
                                                    )}
                                                >
                                                    <Minus size={14} />
                                                </button>
                                                <span class="quantity-display">
                                                    {isUpdating(
                                                        item.groupHash,
                                                        item.productIndex,
                                                    )
                                                        ? "..."
                                                        : item.quantity}
                                                    {getItemDisplayUnit(item)}
                                                </span>
                                                <button
                                                    class="quantity-btn plus-btn"
                                                    on:click|stopPropagation={() =>
                                                        handleIncrementItem(
                                                            item,
                                                        )}
                                                    disabled={isUpdating(
                                                        item.groupHash,
                                                        item.productIndex,
                                                    )}
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        {/if}

                                        <!-- UPDATED: Item totals using PriceService -->
                                        <div class="item-price">
                                            {#if item.productDetails}
                                                {@const itemTotals =
                                                    PriceService.calculateItemTotal(
                                                        item.productDetails,
                                                        item.quantity,
                                                    )}
                                                {@const hasPromo =
                                                    PriceService.hasPromoPrice(
                                                        item.productDetails,
                                                    )}

                                                <span class="price-amount"
                                                    >{PriceService.formatTotal(
                                                        itemTotals.regular,
                                                    )}</span
                                                >
                                                {#if hasPromo}
                                                    <span class="promo-amount"
                                                        >{PriceService.formatTotal(
                                                            itemTotals.promo,
                                                        )}</span
                                                    >
                                                    {#if itemTotals.savings > 0}
                                                        <span
                                                            class="item-savings"
                                                            >You save {PriceService.formatSavings(
                                                                itemTotals.savings,
                                                            )}</span
                                                        >
                                                    {/if}
                                                {/if}
                                            {/if}
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
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>

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
    </div>
</div>

<style>
    .checkout-summary {
        background: var(--background);
        border-radius: var(--card-border-radius);
        width: 100%;
        box-shadow: var(--shadow-subtle);
    }

    .checkout-summary-header {
        height: var(--component-header-height);
        box-sizing: border-box;
        padding: 0 var(--spacing-md);
        background: var(--background);
        border-bottom: var(--border-width-thin) solid var(--border);
        border-radius: var(--card-border-radius) var(--card-border-radius) 0 0;
        display: flex;
        align-items: center;
    }

    .checkout-summary-header h2 {
        margin: 0;
        font-size: var(--spacing-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
    }

    .summary-content {
        padding: var(--spacing-md);
    }

    .summary-sections {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xl);
        margin-bottom: var(--spacing-xl);
    }

    .summary-section {
        border-bottom: var(--border-width-thin) solid var(--border);
        padding-bottom: var(--spacing-md);
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-sm);
    }

    .section-header h3 {
        margin: 0;
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
    }

    .edit-button {
        background: var(--surface);
        border: var(--border-width-thin) solid var(--border);
        color: var(--primary);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        padding: 4px var(--spacing-sm);
        border-radius: var(--btn-border-radius);
        transition: var(--btn-transition);
    }

    .edit-button:hover {
        border-color: var(--primary);
        transform: translateY(var(--hover-lift));
        box-shadow: var(--shadow-subtle);
    }

    .address-details,
    .time-details {
        font-size: var(--font-size-sm);
        color: var(--text-primary);
        line-height: 1.5;
    }

    .address-line {
        margin-bottom: 4px;
    }

    .delivery-instructions {
        margin-top: var(--spacing-xs);
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
        background-color: var(--surface);
        padding: var(--spacing-xs) var(--spacing-sm);
        border-radius: var(--btn-border-radius);
        border-left: var(--border-width) solid var(--primary);
    }

    .instructions-label {
        font-weight: var(--font-weight-semibold);
        margin-right: 4px;
        color: var(--primary);
    }

    .time-date {
        font-weight: var(--font-weight-semibold);
        margin-bottom: 4px;
    }

    .order-items {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
    }

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
        overflow: hidden;
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
    }

    /* UPDATED: Price display styling */
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
        word-break: break-all;
        overflow-wrap: break-word;
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
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

    /* UPDATED: Item price styling */
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
        background: transparent;
        border: none;
        color: var(--error);
        cursor: pointer;
        font-size: var(--font-size-sm);
        padding: 4px var(--spacing-xs);
        border-radius: var(--btn-border-radius);
        transition: var(--btn-transition);
    }

    .remove-item:hover {
        background-color: rgba(211, 47, 47, 0.1);
        text-decoration: underline;
    }

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

    .note-edit-section {
        flex: 1;
        background: var(--surface);
        border-radius: var(--card-border-radius);
        padding: var(--spacing-md);
        box-shadow: var(--shadow-subtle);
        box-sizing: border-box;
    }

    .note-edit-section h4 {
        font-size: var(--btn-font-size-lg);
        font-weight: var(--font-weight-semibold);
        margin: 0 0 var(--spacing-xs) 0;
        color: var(--text-primary);
    }

    .note-edit-section p {
        font-size: var(--font-size-sm);
        margin: 0 0 var(--spacing-xs) 0;
        color: var(--text-secondary);
    }

    .note-input {
        width: 100%;
        min-height: 80px;
        padding: var(--spacing-sm);
        border: var(--border-width-thin) solid var(--border);
        border-radius: var(--btn-border-radius);
        font-size: var(--font-size-sm);
        background: var(--background);
        resize: vertical;
        line-height: 1.4;
        transition: var(--btn-transition);
        box-sizing: border-box;
        max-width: 100%;
    }

    .note-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--spacing-xs);
    }

    .close-note-button {
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        border: none;
        cursor: pointer;
        width: var(--btn-height-sm);
        height: var(--btn-height-sm);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--btn-transition);
        box-shadow: var(--shadow-button);
    }

    .close-note-button:hover {
        transform: scale(var(--hover-scale));
        background: linear-gradient(
            135deg,
            var(--primary-dark),
            var(--secondary)
        );
        box-shadow: var(--shadow-medium);
    }

    :global(.close-note-button svg) {
        color: var(--button-text);
        stroke: var(--button-text);
    }

    .note-input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 2px rgba(86, 98, 189, 0.2);
    }

    .note-input.active {
        border-color: var(--primary);
    }

    .note-input::placeholder {
        color: var(--text-secondary);
    }

    .note-buttons {
        display: flex;
        gap: var(--spacing-sm);
        justify-content: center;
        opacity: 0;
        max-height: 0;
        overflow: hidden;
        margin-top: 0;
        transition:
            opacity 0.3s ease,
            max-height 0.3s ease,
            margin-top 0.3s ease;
    }

    .note-buttons.visible {
        opacity: 1;
        max-height: 50px;
        margin-top: var(--spacing-md);
    }

    .content-container {
        position: relative;
        flex: 1;
        display: flex;
    }

    .note-edit-section,
    .item-content {
        position: absolute;
        width: 100%;
        opacity: 0;
        visibility: hidden;
        transition:
            opacity 0.3s ease,
            visibility 0.3s ease;
    }

    .note-edit-section.active,
    .item-content:not(.hidden) {
        position: relative;
        opacity: 1;
        visibility: visible;
    }

    .cancel-button,
    .save-button {
        padding: var(--spacing-sm) var(--spacing-lg);
        border-radius: var(--btn-border-radius);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        min-width: 120px;
        transition: var(--btn-transition);
        height: var(--btn-height-md);
    }

    .cancel-button {
        background: var(--surface);
        border: var(--border-width-thin) solid var(--border);
        color: var(--text-primary);
    }

    .cancel-button:hover {
        background: var(--background);
        transform: translateY(var(--hover-lift));
        box-shadow: var(--shadow-subtle);
    }

    .save-button {
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        border: none;
        color: var(--button-text);
        box-shadow: var(--shadow-button);
    }

    .save-button:hover {
        background: linear-gradient(
            135deg,
            var(--primary-dark),
            var(--secondary)
        );
        transform: translateY(var(--hover-lift));
        box-shadow: var(--shadow-medium);
    }

    /* New styles for save preference toggle */
    .save-preference-toggle {
        margin-top: var(--spacing-md);
    }

    .toggle-container {
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
    }

    .toggle-container input {
        margin-right: var(--spacing-sm);
        accent-color: var(--primary);
        cursor: pointer;
        width: 16px;
        height: 16px;
    }

    .toggle-text {
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
    }

    .saved-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background-color: var(--success);
        color: white;
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 10px;
        margin-left: var(--spacing-sm);
        font-weight: var(--font-weight-semibold);
    }

    :global(.saved-badge svg) {
        color: white;
        stroke: white;
    }
</style>
