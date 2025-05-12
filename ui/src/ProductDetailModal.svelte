<script lang="ts">
    import {
        createEventDispatcher,
        getContext,
        onMount,
        onDestroy,
    } from "svelte";
    import { X, Plus, Minus, ArrowLeft, Save } from "lucide-svelte";

    const dispatch = createEventDispatcher();
    const cartService = getContext("cartService");

    export let isOpen = false;
    export let product;
    export let groupHashBase64: string;
    export let productIndex: number;
    export let forceShowPreferences = false;

    let quantity = 1;
    let isInCart = false;
    let unsubscribeCartState;
    let note = "";
    let existingNote = "";
    let showPreferences = false;
    let showButtons = false;
    let noteChanged = false;
    let isClosing = false;
    let savePreference = false; // For the "remember preferences" toggle
    let existingPreference = null; // To store existing preference if found
    let loadingPreference = false; // Loading state while fetching preferences
    let isTransitioning = false; // Flag to track button state transitions

    $: isSoldByWeight = product?.sold_by === "WEIGHT";
    $: incrementValue = isSoldByWeight ? 0.25 : 1;

    function formatQuantity(qty) {
        return isSoldByWeight ? `${qty} lb` : qty;
    }

    function closeModal() {
        isClosing = true;
        setTimeout(() => {
            isOpen = false;
            isClosing = false;
            showPreferences = false;
            showButtons = false;
            note = existingNote;
        }, 300); // Match the CSS animation duration
    }

    function handleOverlayClick(e) {
        if (e.target === e.currentTarget) {
            closeModal();
        }
    }

    async function addToCart() {
        if (!$cartService) return;

        try {
            isTransitioning = true; // Start transition animation

            await $cartService.addToCart(
                groupHashBase64,
                productIndex,
                quantity,
                existingNote || undefined,
            );

            // Let transition animation play before updating state
            setTimeout(() => {
                isInCart = true;
                showPreferences = true;
                showButtons = false;
                isTransitioning = false; // End transition animation
            }, 300);

            // Save preference if toggle is on
            if (savePreference && note && note.trim()) {
                await saveProductPreference();
            }
        } catch (error) {
            console.error("Error adding to cart:", error);
            isTransitioning = false;
        }
    }

    async function incrementQuantity() {
        quantity += incrementValue;
        if (isInCart) {
            await updateCartQuantity();
        }
    }

    async function decrementQuantity() {
        quantity = Math.max(0, quantity - incrementValue);
        if (quantity === 0) {
            isTransitioning = true; // Start transition animation

            // Let transition animation play before updating state
            setTimeout(() => {
                isInCart = false;
                showPreferences = false;
                quantity = incrementValue;
                isTransitioning = false; // End transition animation
            }, 300);
        }
        if (isInCart) {
            await updateCartQuantity();
        }
    }

    async function updateCartQuantity() {
        if (!$cartService) return;
        try {
            await $cartService.addToCart(
                groupHashBase64,
                productIndex,
                quantity,
                existingNote || undefined,
            );
        } catch (error) {
            console.error("Error updating cart:", error);
        }
    }

    function checkCartStatus() {
        if (!$cartService) return;
        const items = $cartService.getCartItems();
        const item = items.find(
            (item) =>
                item &&
                item.groupHash === groupHashBase64 &&
                item.productIndex === productIndex,
        );

        if (item) {
            isInCart = true;
            quantity = item.quantity;
            showPreferences = true;
            if (item.note) {
                existingNote = item.note;
                note = item.note;
            } else {
                existingNote = "";
                note = "";
            }
        } else {
            isInCart = false;
            quantity = isSoldByWeight ? 1 : 1;
            showPreferences = false;
        }
    }

    // New function to load product preferences
    async function loadProductPreference() {
        if (!$cartService || !groupHashBase64 || productIndex === undefined)
            return;

        loadingPreference = true;
        try {
            const result = await $cartService.getProductPreference(
                groupHashBase64,
                productIndex,
            );
            if (result && result.success && result.data) {
                existingPreference = result.data.preference;
                savePreference = true;

                // If not already in cart and there's a saved preference, pre-populate the note
                if (!isInCart && existingPreference.note) {
                    note = existingPreference.note;
                    existingNote = existingPreference.note;
                }
            } else {
                existingPreference = null;
                savePreference = false;
            }
        } catch (error) {
            console.error("Error loading product preference:", error);
            existingPreference = null;
            savePreference = false;
        } finally {
            loadingPreference = false;
        }
    }

    // New function to save product preference
    async function saveProductPreference() {
        if (!$cartService || !note || !note.trim()) return;

        try {
            const result = await $cartService.saveProductPreference({
                groupHash: groupHashBase64,
                productIndex,
                note: note.trim(),
                is_default: true,
            });

            if (result && result.success) {
                existingPreference = result.data;
                console.log("Saved product preference:", existingPreference);
            }
        } catch (error) {
            console.error("Error saving product preference:", error);
        }
    }

    // New function to delete product preference
    async function deleteProductPreference() {
        if (!$cartService || !existingPreference) return;

        try {
            const result = await $cartService.deleteProductPreference(
                existingPreference.hash,
            );
            if (result && result.success) {
                existingPreference = null;
                savePreference = false;
                console.log("Deleted product preference");
            }
        } catch (error) {
            console.error("Error deleting product preference:", error);
        }
    }

    function portal(node) {
        let target = document.body;

        function update() {
            target.appendChild(node);
        }

        function destroy() {
            node.parentNode?.removeChild(node);
        }

        update();

        return {
            update,
            destroy,
        };
    }

    function handleNoteInput() {
        showButtons = note !== existingNote;
        noteChanged = note !== existingNote;
    }

    async function saveInstructions() {
        if (!$cartService) return;
        try {
            await $cartService.addToCart(
                groupHashBase64,
                productIndex,
                quantity,
                note || undefined,
            );
            existingNote = note;
            showButtons = false;
            noteChanged = false;

            // Save preference if toggle is on
            if (savePreference && note && note.trim()) {
                await saveProductPreference();
            } else if (!savePreference && existingPreference) {
                // If toggle is off but preference exists, delete it
                await deleteProductPreference();
            }
        } catch (error) {
            console.error("Error saving instructions:", error);
        }
    }

    function cancelPreferences() {
        note = existingNote;
        showButtons = false;
        noteChanged = false;
    }

    onMount(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            checkCartStatus();

            if (forceShowPreferences || isInCart) {
                showPreferences = true;
            }

            // Load existing preference for this product
            loadProductPreference();
        }

        if ($cartService) {
            unsubscribeCartState = $cartService.subscribe(() => {
                checkCartStatus();
            });
        }
    });

    onDestroy(() => {
        document.body.style.overflow = "";
        if (unsubscribeCartState) unsubscribeCartState();
    });

    $: if (isOpen) {
        document.body.style.overflow = "hidden";
        if (forceShowPreferences || isInCart) {
            showPreferences = true;
        }

        // Add this line to load preferences whenever modal opens
        loadProductPreference();
    } else {
        document.body.style.overflow = "";
    }

    // Toggle preference saving based on checkbox
    function handleSavePreferenceToggle(e) {
        savePreference = e.target.checked;

        // If toggle turned off and there's an existing preference, show delete button
        showButtons =
            savePreference !== (existingPreference !== null) || noteChanged;
    }
</script>

{#if isOpen}
    <div
        class="modal-overlay {isClosing ? 'fade-out' : 'fade-in'}"
        on:click={handleOverlayClick}
        use:portal
    >
        <div class="product-modal {isClosing ? 'scale-out' : 'scale-in'}">
            <div class="modal-header">
                <button class="back-button btn btn-text" on:click={closeModal}>
                    <ArrowLeft size={16} /> Back
                </button>
                <button
                    class="close-button btn btn-icon btn-icon-primary btn-icon-sm"
                    on:click={closeModal}
                >
                    <X size={20} />
                </button>
            </div>

            <div class="modal-content">
                <div class="product-section">
                    <div class="product-image-container">
                        {#if product.image_url}
                            <img
                                src={product.image_url}
                                alt={product.name}
                                class="product-image"
                            />
                        {/if}
                    </div>

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

                        <h1 class="product-title">{product.name}</h1>
                        <div class="shop-all btn-link">
                            Shop all {product.category}
                        </div>

                        <div class="product-details">
                            <h3>Details</h3>
                            <div class="details-content">
                                <p>{product.size || "1 each"}</p>
                            </div>
                        </div>
                    </div>

                    <div class="purchase-section">
                        <div class="product-price">
                            {#if product.promo_price && product.promo_price < product.price}
                                <div class="promo-price-line">
                                    <span class="promo-price"
                                        >${Number(product.promo_price).toFixed(
                                            2,
                                        )}</span
                                    >
                                    {#if isSoldByWeight}
                                        <span class="price-unit">/lb</span>
                                    {/if}
                                </div>
                                <div class="regular-price-line">
                                    <span class="regular-price"
                                        >reg. ${Number(product.price).toFixed(
                                            2,
                                        )}</span
                                    >
                                    {#if isSoldByWeight}
                                        <span class="price-unit">/lb</span>
                                    {/if}
                                </div>
                                <div class="loyalty-label">
                                    With loyalty card
                                </div>
                            {:else}
                                <div class="current-price-line">
                                    <span class="current-price"
                                        >${Number(product.price).toFixed(
                                            2,
                                        )}</span
                                    >
                                    {#if isSoldByWeight}
                                        <span class="price-unit">/lb</span>
                                    {/if}
                                </div>
                            {/if}
                        </div>

                        <div class="quantity-control-container">
                            <!-- Not-in-cart quantity controls -->
                            <div
                                class="quantity-control {isInCart
                                    ? 'slide-out-right hide'
                                    : 'slide-in-left'} {isTransitioning
                                    ? 'transitioning'
                                    : ''}"
                            >
                                <div class="quantity-selector">
                                    <button
                                        class="quantity-button btn btn-icon btn-icon-primary"
                                        on:click={decrementQuantity}
                                        disabled={quantity <= incrementValue}
                                    >
                                        <Minus size={20} />
                                    </button>
                                    <span class="quantity-display"
                                        >{formatQuantity(quantity)}</span
                                    >
                                    <button
                                        class="quantity-button btn btn-icon btn-icon-primary"
                                        on:click={incrementQuantity}
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                                <button
                                    class="add-to-cart-button btn btn-primary btn-md"
                                    on:click={addToCart}
                                >
                                    Add to cart
                                </button>
                            </div>

                            <!-- In-cart quantity controls -->
                            <div
                                class="quantity-control in-cart {isInCart
                                    ? 'slide-in-left'
                                    : 'slide-out-right hide'} {isTransitioning
                                    ? 'transitioning'
                                    : ''}"
                            >
                                <div class="counter-btn-group">
                                    <span
                                        class="counter-btn minus"
                                        on:click|stopPropagation={decrementQuantity}
                                    >
                                        <Minus size={20} />
                                    </span>
                                    <span class="counter-value"
                                        >{formatQuantity(quantity)} in cart</span
                                    >
                                    <span
                                        class="counter-btn plus"
                                        on:click|stopPropagation={incrementQuantity}
                                    >
                                        <Plus size={20} />
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    class="preferences-section {showPreferences
                        ? 'visible'
                        : ''}"
                >
                    <h2>Your preferences</h2>
                    <div class="preferences-input-row">
                        <div class="input-container">
                            <p class="preferences-label">
                                Special instructions
                            </p>
                            <input
                                type="text"
                                bind:value={note}
                                on:input={handleNoteInput}
                                placeholder="I would like my shopper to..."
                                class="preferences-input {noteChanged
                                    ? 'active'
                                    : ''}"
                            />

                            <!-- Checkbox for saving preferences -->
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
                                            Remember my preferences for next
                                            time
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
                        </div>
                        {#if showButtons}
                            <div class="preferences-buttons">
                                <button
                                    class="cancel-button btn btn-secondary btn-md"
                                    on:click={cancelPreferences}
                                >
                                    Cancel
                                </button>
                                <button
                                    class="save-button btn btn-primary btn-md"
                                    on:click={saveInstructions}
                                >
                                    Save
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--overlay-dark);
        z-index: var(--z-index-highest);
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        touch-action: none;
    }

    .modal-overlay.fade-in {
        animation: fadeIn var(--transition-fast) ease forwards;
    }

    .modal-overlay.fade-out {
        animation: fadeOut var(--transition-fast) ease forwards;
    }

    .product-modal {
        background: var(--background);
        width: 95%;
        max-width: 1400px;
        height: auto;
        max-height: 850px;
        margin: 0 auto;
        border-radius: var(--card-border-radius);
        position: relative;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-medium);
        overflow: hidden;
    }

    .product-modal.scale-in {
        animation: scaleIn var(--transition-normal) ease forwards;
    }

    .product-modal.scale-out {
        animation: scaleOut var(--transition-normal) ease forwards;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-sm) var(--spacing-lg);
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        color: var(--button-text);
        border-bottom: var(--border-width-thin) solid rgba(255, 255, 255, 0.1);
    }

    .back-button {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        color: var(--button-text);
    }

    :global(.back-button svg) {
        color: var(--button-text);
        stroke: var(--button-text);
    }

    :global(.close-button svg) {
        color: var(--button-text);
        stroke: var(--button-text);
    }

    .modal-content {
        display: flex;
        flex-direction: column;
        transition: height var(--transition-normal) ease;
    }

    .product-section {
        display: grid;
        grid-template-columns: 0.8fr 1.2fr 0.8fr;
        gap: var(--spacing-xxl);
        padding: var(--spacing-xl);
    }

    .product-image-container {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .product-image {
        max-width: 100%;
        max-height: 320px;
        object-fit: contain;
    }

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
        font-size: 15px;
        margin-bottom: var(--spacing-md);
        cursor: pointer;
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

    .purchase-section {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xl);
        padding-right: var(--spacing-sm);
    }

    .product-price {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .promo-price-line,
    .current-price-line,
    .regular-price-line {
        display: flex;
        align-items: baseline;
    }

    .promo-price,
    .current-price {
        font-size: 28px;
        font-weight: var(--font-weight-bold);
        color: var(--text-primary);
        line-height: 1;
    }

    .price-unit {
        font-size: var(--spacing-lg);
        color: var(--text-secondary);
        line-height: 1;
        margin-left: var(--spacing-xs);
    }

    .regular-price {
        font-size: 15px;
        color: var(--text-secondary);
        text-decoration: line-through;
        line-height: 1;
    }

    .regular-price-line .price-unit {
        font-size: 15px;
    }

    .loyalty-label {
        background-color: var(--warning);
        color: #684500;
        padding: 3px 6px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: var(--font-weight-semibold);
        display: inline-block;
        width: fit-content;
    }

    /* Quantity control container for transitions */
    .quantity-control-container {
        position: relative;
        height: 120px; /* Fixed height to prevent layout shift */
    }

    .quantity-control {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
        transition: all var(--transition-normal) ease;
    }

    /* Hide elements when they're not active */
    .quantity-control.hide {
        visibility: hidden;
        opacity: 0;
    }

    /* Animation classes */
    .quantity-control.slide-in-left {
        animation: slideInLeft var(--transition-normal) ease forwards;
    }

    .quantity-control.slide-out-right {
        animation: slideOutRight var(--transition-normal) ease forwards;
    }

    /* Animation pause during transition */
    .quantity-control.transitioning {
        animation-play-state: running;
    }

    .quantity-selector {
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
        width: fit-content;
    }

    .quantity-display {
        min-width: 60px;
        text-align: center;
        font-size: 17px;
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
        padding: 0 var(--spacing-sm);
    }

    .add-to-cart-button {
        width: 100%;
    }

    /* In-cart styling */
    .quantity-control.in-cart {
        width: 100%;
    }

    /* Counter button styling from app.css */
    .counter-btn-group {
        width: 100%;
        max-width: 100%; /* Ensure it doesn't exceed container width */
        box-sizing: border-box;
    }

    /* Make the add-to-cart and in-cart buttons the same width */
    .add-to-cart-button,
    .counter-btn-group {
        width: 100%;
        box-sizing: border-box;
    }

    .counter-btn {
        cursor: pointer;
    }

    .counter-value {
        min-width: 120px; /* Ensure enough space for "in cart" text */
        white-space: nowrap;
    }

    /* Additional styling for quantity button icons */
    :global(.quantity-button svg),
    :global(.cart-quantity-button svg),
    :global(.counter-btn svg) {
        color: var(--button-text);
        stroke: var(--button-text);
    }

    .preferences-section {
        background: var(--surface);
        border-top: var(--border-width-thin) solid var(--border);
        padding: var(--spacing-xl);
        width: 100%;
        box-sizing: border-box;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transition:
            max-height var(--transition-normal) ease,
            opacity var(--transition-normal) ease;
    }

    .preferences-section.visible {
        max-height: 300px;
        opacity: 1;
        animation: slideInUp var(--transition-normal) ease forwards;
    }

    .preferences-input-row {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--spacing-lg);
    }

    .input-container {
        flex: 1;
        max-width: 70%;
    }

    .preferences-label {
        font-size: 15px;
        color: var(--text-primary);
        margin-bottom: var(--spacing-sm);
    }

    .preferences-input {
        width: 100%;
        height: var(--btn-height-lg);
        padding: var(--spacing-sm);
        border: var(--border-width-thin) solid var(--border);
        border-radius: var(--btn-border-radius);
        font-size: 15px;
        background: var(--background);
        transition: var(--btn-transition);
        box-sizing: border-box;
    }

    .preferences-input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: var(--shadow-subtle);
    }

    .preferences-input.active {
        border-color: var(--primary);
    }

    .preferences-input::placeholder {
        color: var(--text-secondary);
    }

    .preferences-buttons {
        display: flex;
        gap: var(--spacing-sm);
        align-items: center;
        height: var(--btn-height-lg);
    }

    /* Save preference toggle styling */
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

    @media (max-width: 1024px) {
        .product-section {
            grid-template-columns: 1fr;
            padding: var(--spacing-md);
            gap: var(--spacing-lg);
        }

        .product-modal {
            height: auto;
            max-height: 90vh;
        }

        .product-image-container {
            padding-top: 0;
        }

        .preferences-section {
            padding: var(--spacing-md);
        }

        .preferences-input-row {
            flex-direction: column;
            align-items: stretch;
        }

        .input-container {
            max-width: 100%;
        }

        .preferences-buttons {
            justify-content: flex-end;
            margin-top: var(--spacing-sm);
        }

        .quantity-control-container {
            height: 150px; /* Increase height for mobile layout */
        }
    }
</style>
