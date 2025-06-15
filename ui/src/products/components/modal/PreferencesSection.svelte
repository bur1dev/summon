<script lang="ts">
    import { get, type Writable } from "svelte/store";
    import type { CartBusinessService } from "../../../cart/services/CartBusinessService";
    import { preferences, savePreference as savePreferenceAPI, deletePreference, updateSavePreference, getPreferenceKey } from "../../services/PreferencesService";
    import { Save } from "lucide-svelte";

    export let cartServiceStore: Writable<CartBusinessService | null>;
    export let groupHashBase64: string;
    export let productIndex: number;
    export let quantity: number;
    export let note: string;
    export let existingNote: string;
    export let showPreferences: boolean;
    export let showButtons: boolean;
    export let noteChanged: boolean;
    export let existingPreference: any;
    export let loadingPreference: boolean;
    export let onNoteChange: (newNote: string) => void;
    export let onShowButtonsChange: (show: boolean) => void;
    export let onNoteChangedChange: (changed: boolean) => void;
    export let onExistingNoteChange: (note: string) => void;
    export let onSave: (() => void) | null = null;

    // Direct reactive access to preference state
    $: preferenceKey = getPreferenceKey(groupHashBase64, productIndex);
    $: preferenceData = $preferences[preferenceKey] || { loading: false, preference: null, savePreference: false };
    $: savePreference = preferenceData.savePreference;

    async function saveProductPreference() {
        if (!note || !note.trim()) return;
        await savePreferenceAPI(groupHashBase64, productIndex, note.trim());
    }

    async function deleteProductPreference() {
        if (!existingPreference || !existingPreference.hash) return;

        const success = await deletePreference(existingPreference.hash, groupHashBase64, productIndex);
        if (success) {
            existingPreference = null;
            savePreference = false;
        }
    }

    function handleNoteInput() {
        onShowButtonsChange(note !== existingNote);
        onNoteChangedChange(note !== existingNote);
    }

    async function saveInstructions() {
        const serviceInstance = get(cartServiceStore);
        if (!serviceInstance) {
            console.error(
                "PreferencesSection: saveInstructions called but cartService instance is not available.",
            );
            return;
        }
        try {
            await serviceInstance.addToCart(
                groupHashBase64,
                productIndex,
                quantity,
                note || undefined,
            );
            onExistingNoteChange(note);
            onShowButtonsChange(false);
            onNoteChangedChange(false);

            // Save preference if toggle is on
            if (savePreference && note && note.trim()) {
                await saveProductPreference();
            } else if (!savePreference && existingPreference) {
                // If toggle is off but preference exists, delete it
                await deleteProductPreference();
            }

            // Close modal after successful save
            if (onSave) {
                onSave();
            }
        } catch (error) {
            console.error("Error saving instructions:", error);
        }
    }

    function cancelPreferences() {
        onNoteChange(existingNote);
        onShowButtonsChange(false);
        onNoteChangedChange(false);
    }

    function handleSavePreferenceToggle(e: Event) {
        const target = e.target as HTMLInputElement;
        const checked = target.checked;

        // Update service state
        updateSavePreference(groupHashBase64, productIndex, checked);

        // If toggle turned off and there's an existing preference, show delete button
        onShowButtonsChange(
            checked !== (existingPreference !== null) || noteChanged,
        );
    }
</script>

<div class="preferences-section {showPreferences ? 'visible' : ''}">
    <h2>Your preferences</h2>
    <div class="preferences-input-row">
        <div class="input-container">
            <p class="preferences-label">Special instructions</p>
            <input
                type="text"
                bind:value={note}
                on:input={handleNoteInput}
                placeholder="I would like my shopper to..."
                class="preferences-input {noteChanged ? 'active' : ''}"
            />

            <!-- Checkbox for saving preferences -->
            <div class="save-preference-toggle">
                <label class="toggle-container">
                    <input
                        type="checkbox"
                        checked={savePreference}
                        on:change={handleSavePreferenceToggle}
                        disabled={loadingPreference}
                    />
                    <span class="toggle-text">
                        {#if loadingPreference}
                            Loading...
                        {:else}
                            Remember my preferences for next time
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

<style>
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
    }
</style>
