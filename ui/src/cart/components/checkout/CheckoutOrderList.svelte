<script lang="ts">
    import type { CartBusinessService } from "../../services/CartBusinessService";
    import { PreferencesService } from "../../../products/services/PreferencesService";
    import {
        getCartItemKey,
    } from "../../utils/cartHelpers";
    import CheckoutOrderItem from "./CheckoutOrderItem.svelte";

    // Props
    export let cartItems: any[] = [];
    export let cartService: CartBusinessService | null = null;

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
    $: editingPreferenceStore = editingNoteForItem
        ? PreferencesService.getPreferenceStore(
              editingNoteForItem.groupHash,
              editingNoteForItem.productIndex,
          )
        : null;

    // Derive preference state from service store
    $: if (editingPreferenceStore && $editingPreferenceStore) {
        loadingPreference = $editingPreferenceStore.loading;
        existingPreference = $editingPreferenceStore.preference;
        savePreference = $editingPreferenceStore.savePreference;
    }

    // To detect new cart items
    let previousCartItems: any[] = [...cartItems];


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


    // Note editing functionality
    async function startEditingNote(item: any) {
        editingNoteForItem = item;
        currentNote = item.note || "";
        showNoteButtons = false;
        noteChanged = false;

        // Load existing preference data using the service
        if (cartService) {
            await PreferencesService.loadPreference(
                cartService,
                item.groupHash,
                item.productIndex,
            );
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
                    currentNote.trim(),
                );
            } else if (!savePreference && existingPreference) {
                await PreferencesService.deletePreference(
                    cartService!,
                    existingPreference.hash,
                    editingNoteForItem.groupHash,
                    editingNoteForItem.productIndex,
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
                savePreference,
            );
        }

        // If toggle turned off and there's an existing preference, show delete button
        showNoteButtons =
            savePreference !== (existingPreference !== null) || noteChanged;
    }

</script>

<div class="summary-section">
    <h3>Order Details</h3>
    <div class="order-items">
        {#each [...cartItems].sort((a, b) => a.groupHash.localeCompare(b.groupHash) || a.productIndex - b.productIndex) as item}
            <CheckoutOrderItem
                {item}
                {cartService}
                {editingNoteForItem}
                {currentNote}
                {showNoteButtons}
                {noteChanged}
                {savePreference}
                {existingPreference}
                {loadingPreference}
                {updatingProducts}
                onStartEditingNote={startEditingNote}
                onHandleNoteInput={handleNoteInput}
                onSaveNote={saveNote}
                onCancelNote={cancelNote}
                onHandleSavePreferenceToggle={handleSavePreferenceToggle}
                onUpdateQuantity={updateQuantity}
                onHandleRemove={handleRemove}
            />
        {/each}
    </div>
</div>

<style>
    .summary-section {
        border-bottom: var(--border-width-thin) solid var(--border);
        padding-bottom: var(--spacing-md);
    }

    .summary-section h3 {
        margin: 0 0 var(--spacing-sm) 0;
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
    }

    .order-items {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
    }

</style>