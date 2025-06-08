<script lang="ts">
    import { PencilLine, Plus, Minus, X, Save } from "lucide-svelte";
    import type { CartBusinessService } from "../../services/CartBusinessService";
    import { PriceService } from "../../../services/PriceService";
    import {
        getIncrementValue,
        getDisplayUnit,
        getCartItemKey,
    } from "../../utils/cartHelpers";

    // Props
    export let item: any;
    export let cartService: CartBusinessService | null = null;
    export let editingNoteForItem: any = null;
    export let currentNote = "";
    export let showNoteButtons = false;
    export let noteChanged = false;
    export let savePreference = false;
    export let existingPreference: any = null;
    export let loadingPreference = false;
    export let updatingProducts: Map<string, number>;
    export let onStartEditingNote: (item: any) => void;
    export let onHandleNoteInput: () => void;
    export let onSaveNote: () => void;
    export let onCancelNote: () => void;
    export let onHandleSavePreferenceToggle: (e: Event) => void;
    export let onUpdateQuantity: (groupHash: any, productIndex: any, newQuantity: any, note: any) => void;
    export let onHandleRemove: (groupHash: any, productIndex: any) => void;

    // Use cart helper for item key creation
    function getItemKey(item: any): string {
        return getCartItemKey(item.groupHash, item.productIndex);
    }

    function handleDecrementItem(item: any) {
        const itemKey = getItemKey(item);
        const incrementValue = getIncrementValue(item.productDetails);

        if (item.quantity > incrementValue && !updatingProducts.has(itemKey)) {
            onUpdateQuantity(
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
            onUpdateQuantity(
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

    // Use cart helper for display unit
    function getItemDisplayUnit(item: any): string {
        return getDisplayUnit(item.productDetails);
    }
</script>

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
                    on:click={onCancelNote}
                >
                    <X size={20} />
                </button>
            </div>
            <p>Special instructions</p>
            <textarea
                bind:value={currentNote}
                on:input={onHandleNoteInput}
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
                        checked={savePreference}
                        on:change={onHandleSavePreferenceToggle}
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
                    on:click={onCancelNote}>Cancel</button
                >
                <button
                    class="save-button"
                    on:click={onSaveNote}
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
                        onStartEditingNote(item)}
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
                            onHandleRemove(
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
        display: none;
    }

    .note-edit-section.active {
        display: block;
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
        margin: 0;
        padding: 0;
    }

    .item-content {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: space-between;
        overflow: hidden;
        box-sizing: border-box;
    }

    .item-content.hidden {
        display: none;
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