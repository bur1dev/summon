<script lang="ts">
    import {
        createEventDispatcher,
        getContext,
        onMount,
        onDestroy,
    } from "svelte";
    import { get, type Writable } from "svelte/store"; // Import get
    import type { CartBusinessService } from "../../../cart/services/CartBusinessService";
    import { CartInteractionService } from "../../../cart/services/CartInteractionService";
    import { PreferencesService } from "../../services/PreferencesService";
    import ProductModalHeader from "./ProductModalHeader.svelte";
    import ProductImage from "./ProductImage.svelte";
    import ProductInfo from "./ProductInfo.svelte";
    import ProductPricing from "./ProductPricing.svelte";
    import QuantityControls from "./QuantityControls.svelte";
    import PreferencesSection from "./PreferencesSection.svelte";

    const dispatch = createEventDispatcher();
    // cartServiceStore holds the store from context, which in turn holds the CartBusinessService instance (or null)
    const cartServiceStore =
        getContext<Writable<CartBusinessService | null>>("cartService");

    export let isOpen: boolean = false;
    export let product: any;
    export let groupHashBase64: string;
    export let productIndex: number;
    export let forceShowPreferences: boolean = false;

    export let selectedCategory: string = "";
    export let selectedSubcategory: string = "";

    let quantity: number = 1;
    let isInCart: boolean = false;
    let unsubscribeCartState: (() => void) | null = null;
    let note: string = "";
    let existingNote: string = "";
    let showPreferences: boolean = false;
    let showButtons: boolean = false;
    let noteChanged: boolean = false;
    let isClosing: boolean = false;
    let isTransitioning: boolean = false; // Flag to track button state transitions

    // Get preference store from service - reactive state management
    $: preferenceStore = PreferencesService.getPreferenceStore(groupHashBase64, productIndex);
    
    // Derive preference state from service store (maintains exact same variable names)
    $: savePreference = $preferenceStore.savePreference;
    $: existingPreference = $preferenceStore.preference;
    $: loadingPreference = $preferenceStore.loading;


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

            const success = await CartInteractionService.updateQuantity(
                cartServiceStore,
                groupHashBase64,
                productIndex,
                quantity,
                existingNote || undefined,
                product
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
        const serviceInstance = get(cartServiceStore);
        if (!serviceInstance) {
            // This might be called before the service is set in the store, especially on initial mount.
            // console.log("ProductDetailModal: checkCartStatus called but cartService instance is not yet available from store.");
            return;
        }
        // Use centralized service to get cart data
        const items = serviceInstance.getCartItems();
        const item = CartInteractionService.findCartItem(items, groupHashBase64, productIndex);
        
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
        const serviceInstance = get(cartServiceStore);
        if (!serviceInstance || !groupHashBase64 || productIndex === undefined) {
            return;
        }

        await PreferencesService.loadPreference(serviceInstance, groupHashBase64, productIndex);
        
        // If not already in cart and there's a saved preference, pre-populate the note
        if (!isInCart && existingPreference && existingPreference.preference?.note) {
            note = existingPreference.preference.note;
            existingNote = existingPreference.preference.note;
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


    let unsubscribeFromServiceInstance: (() => void) | null = null;

    onMount(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            // Initial check using get(), service might not be ready for methods yet
            // but checkCartStatus and loadProductPreference internally use get() and handle null instance
            checkCartStatus();
            loadProductPreference();
        }

        // This outer subscription is to get the serviceInstance when it becomes available
        unsubscribeCartState = cartServiceStore.subscribe((serviceInstance) => {
            // Clean up any previous subscription to an old service instance's items
            if (unsubscribeFromServiceInstance) {
                unsubscribeFromServiceInstance();
                unsubscribeFromServiceInstance = null;
            }

            if (
                serviceInstance &&
                typeof serviceInstance.subscribe === "function"
            ) {
                // Now that we have a valid serviceInstance, subscribe to its internal cart item changes
                unsubscribeFromServiceInstance = serviceInstance.subscribe(
                    (_cartItemsFromService) => {
                        // This callback is triggered when items in SimpleCartService change.
                        // Re-run checkCartStatus to update the modal's view of the cart.
                        checkCartStatus();
                    },
                );

                // Also, perform an initial check and preference load when the service instance first becomes available or changes
                checkCartStatus();
                if (isOpen) {
                    // Only load preferences if modal is open and service is available
                    loadProductPreference();
                }
            } else {
                // Service instance is null (e.g., on logout or initial state)
                // Reset local state that depends on the cart
                isInCart = false;
                quantity = 1; // Default quantity // Reset to default
                showPreferences = false;
                note = ""; // Clear note
                existingNote = "";
                // Potentially clear other states like existingPreference if they are tied to a cart session
            }
        });
    });

    onDestroy(() => {
        document.body.style.overflow = "";
        if (unsubscribeCartState) {
            unsubscribeCartState(); // Unsubscribe from cartServiceStore
        }
        if (unsubscribeFromServiceInstance) {
            unsubscribeFromServiceInstance(); // Unsubscribe from serviceInstance.subscribe
        }
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
                            {cartServiceStore}
                            {product}
                            {groupHashBase64}
                            {productIndex}
                            {quantity}
                            {isInCart}
                            {existingNote}
                            {isTransitioning}
                            onQuantityChange={(newQuantity) => { quantity = newQuantity; }}
                            onAddToCart={addToCart}
                            onTransitionStart={() => { isTransitioning = true; }}
                            onTransitionEnd={() => { 
                                isInCart = false;
                                showPreferences = false;
                                isTransitioning = false;
                            }}
                        />
                    </div>
                </div>

                <PreferencesSection
                    {cartServiceStore}
                    {groupHashBase64}
                    {productIndex}
                    {quantity}
                    bind:note
                    {existingNote}
                    {showPreferences}
                    bind:showButtons
                    bind:noteChanged
                    {savePreference}
                    {existingPreference}
                    {loadingPreference}
                    onNoteChange={(newNote) => { note = newNote; }}
                    onShowButtonsChange={(show) => { showButtons = show; }}
                    onNoteChangedChange={(changed) => { noteChanged = changed; }}
                    onExistingNoteChange={(newNote) => { existingNote = newNote; }}
                    onSave={closeModal}
                />
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
