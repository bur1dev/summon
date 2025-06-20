<script lang="ts">
    import {
        createEventDispatcher,
        onMount,
        onDestroy,
    } from "svelte";
    import { cartItems, getCartItems } from "../../../cart/services/CartBusinessService";
    import { updateQuantity, findCartItem } from "../../../cart/services/CartInteractionService";
    import { preferences, loadPreference, getPreferenceKey } from "../../services/PreferencesService";
    import { parseProductHash } from "../../../cart/utils/cartHelpers";
    import ProductModalHeader from "./ProductModalHeader.svelte";
    import ProductImage from "./ProductImage.svelte";
    import ProductInfo from "./ProductInfo.svelte";
    import ProductPricing from "./ProductPricing.svelte";
    import QuantityControls from "./QuantityControls.svelte";
    import PreferencesSection from "./PreferencesSection.svelte";

    const dispatch = createEventDispatcher();

    export let isOpen: boolean = false;
    export let product: any;
    export let forceShowPreferences: boolean = false;

    export let selectedCategory: string = "";
    export let selectedSubcategory: string = "";

    let quantity: number = 1;
    let isInCart: boolean = false;
    let note: string = "";
    let existingNote: string = "";
    let showPreferences: boolean = false;
    let showButtons: boolean = false;
    let noteChanged: boolean = false;
    let isClosing: boolean = false;
    let isTransitioning: boolean = false; // Flag to track button state transitions

    // Parse product hash to get consistent data
    $: ({ groupHash: groupHashBase64, productIndex, productId } = parseProductHash(product));
    
    // SIMPLIFIED: Ultra-simple reactive preference access - massive code reduction!
    $: preferenceKey = groupHashBase64 && productIndex !== null ? getPreferenceKey(groupHashBase64, productIndex) : null;
    $: preferenceData = preferenceKey ? ($preferences[preferenceKey] || { loading: false, preference: null, savePreference: false }) : { loading: false, preference: null, savePreference: false };
    $: existingPreference = preferenceData.preference;
    $: loadingPreference = preferenceData.loading;

    // Reactive cart status checking - replaces manual subscription
    $: if ($cartItems) {
        checkCartStatus();
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

    function handleOverlayClick(e: MouseEvent) {
        if (e.target === e.currentTarget) {
            closeModal();
        }
    }

    function handleOverlayKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeModal();
        }
    }

    async function addToCart() {
        try {
            isTransitioning = true; // Start transition animation

            const success = await updateQuantity(
                product,
                quantity,
                existingNote || undefined
            );

            if (!success) {
                isTransitioning = false;
                return;
            }

            // Let transition animation play before updating state
            setTimeout(() => {
                isInCart = true;
                showPreferences = true;
                showButtons = false;
                isTransitioning = false; // End transition animation
            }, 300);
        } catch (error) {
            console.error("Error adding to cart:", error);
            isTransitioning = false;
        }
    }

    function checkCartStatus() {
        // SIMPLIFIED: Use centralized service to get cart data
        if (!productId) return;
        
        const items = getCartItems();
        const item = findCartItem(items, productId);

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
            quantity = 1; // Default quantity
            showPreferences = false;
        }
    }

    // Load product preferences using service
    async function loadProductPreference() {
        if (!groupHashBase64 || productIndex === null) {
            return;
        }

        await loadPreference(groupHashBase64, productIndex);

        // If not already in cart and there's a saved preference, pre-populate the note
        if (
            !isInCart &&
            existingPreference &&
            existingPreference.preference?.note
        ) {
            note = existingPreference.preference.note;
            existingNote = existingPreference.preference.note;
        } else if (!isInCart) {
            // Clear stale note data if no DHT preference exists
            note = "";
            existingNote = "";
        }
    }

    function portal(node: HTMLElement) {
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

    // Cleanup variable no longer needed with direct store access

    onMount(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            // Initial check using get(), service might not be ready for methods yet
            // but checkCartStatus and loadProductPreference internally use get() and handle null instance
            checkCartStatus();
            loadProductPreference();
        }

        // Initial check
        checkCartStatus();
        if (isOpen) {
            loadProductPreference();
        }
    });

    onDestroy(() => {
        document.body.style.overflow = "";
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
</script>

{#if isOpen}
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
        class="modal-overlay {isClosing ? 'fade-out' : 'fade-in'}"
        on:click={handleOverlayClick}
        on:keydown={handleOverlayKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-title"
        use:portal
    >
        <div class="product-modal {isClosing ? 'scale-out' : 'scale-in'}">
            <ProductModalHeader on:close={closeModal} />

            <div class="modal-content">
                <div class="product-section">
                    <ProductImage {product} />

                    <ProductInfo
                        {product}
                        {selectedCategory}
                        {selectedSubcategory}
                        on:productTypeSelect
                        on:close={closeModal}
                    />

                    <div class="purchase-section">
                        <ProductPricing {product} />

                        <QuantityControls
                            {product}
                            {quantity}
                            {isInCart}
                            {existingNote}
                            {isTransitioning}
                            onQuantityChange={(newQuantity) => {
                                quantity = newQuantity;
                            }}
                            onAddToCart={addToCart}
                            onTransitionStart={() => {
                                isTransitioning = true;
                            }}
                            onTransitionEnd={() => {
                                isInCart = false;
                                showPreferences = false;
                                isTransitioning = false;
                            }}
                        />
                    </div>
                </div>

                {#if groupHashBase64 && productIndex !== null}
                    <PreferencesSection
                        groupHashBase64={groupHashBase64}
                        productIndex={productIndex}
                        {quantity}
                        bind:note
                        {existingNote}
                        {showPreferences}
                        bind:showButtons
                        bind:noteChanged
                    {existingPreference}
                    {loadingPreference}
                    onNoteChange={(newNote) => {
                        note = newNote;
                    }}
                    onShowButtonsChange={(show) => {
                        showButtons = show;
                    }}
                    onNoteChangedChange={(changed) => {
                        noteChanged = changed;
                    }}
                    onExistingNoteChange={(newNote) => {
                        existingNote = newNote;
                    }}
                    onSave={closeModal}
                />
                {/if}
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

    .purchase-section {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xl);
        padding-right: var(--spacing-sm);
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
    }
</style>
