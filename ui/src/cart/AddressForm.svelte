<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { Address } from "./AddressService";

    export let initialAddress: Partial<Address> = {
        street: "",
        unit: "",
        city: "",
        state: "",
        zip: "",
        lat: 0,
        lng: 0,
        is_default: true,
        label: "Home",
    };

    export let title = "Add New Address";
    export let submitButtonText = "Save Address";
    export let isValidating = false;
    export let validationError = "";

    // Create a copy of the address to edit
    let address: Partial<Address> = { ...initialAddress };

    const dispatch = createEventDispatcher();

    function handleSubmit() {
        // Validate form
        if (!address.street) {
            validationError = "Street address is required";
            return;
        }

        if (!address.city) {
            validationError = "City is required";
            return;
        }

        if (!address.state) {
            validationError = "State is required";
            return;
        }

        if (!address.zip) {
            validationError = "ZIP code is required";
            return;
        }

        if (!/^\d{5}$/.test(address.zip)) {
            validationError = "ZIP code must be 5 digits";
            return;
        }

        // Form is valid, dispatch event
        dispatch("submit", {
            address: {
                street: address.street,
                unit: address.unit || null,
                city: address.city,
                state: address.state,
                zip: address.zip,
                lat: address.lat || 0,
                lng: address.lng || 0,
                is_default: address.is_default !== false,
                label: address.label || null,
            },
        });
    }

    function handleCancel() {
        dispatch("cancel");
    }
</script>

<div class="address-form">
    <h2>{title}</h2>

    {#if validationError}
        <div class="validation-error">
            {validationError}
        </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
            <label for="street">Street Address *</label>
            <input
                type="text"
                id="street"
                bind:value={address.street}
                placeholder="123 Main St"
                required
                disabled={isValidating}
            />
        </div>

        <div class="form-group">
            <label for="unit">Apartment/Unit</label>
            <input
                type="text"
                id="unit"
                bind:value={address.unit}
                placeholder="Apt 4B"
                disabled={isValidating}
            />
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="city">City *</label>
                <input
                    type="text"
                    id="city"
                    bind:value={address.city}
                    placeholder="San Diego"
                    required
                    disabled={isValidating}
                />
            </div>

            <div class="form-group state-zip-group">
                <div class="state-group">
                    <label for="state">State *</label>
                    <input
                        type="text"
                        id="state"
                        bind:value={address.state}
                        placeholder="CA"
                        maxlength="2"
                        required
                        disabled={isValidating}
                    />
                </div>

                <div class="zip-group">
                    <label for="zip">ZIP *</label>
                    <input
                        type="text"
                        id="zip"
                        bind:value={address.zip}
                        placeholder="92101"
                        inputmode="numeric"
                        maxlength="5"
                        required
                        disabled={isValidating}
                    />
                </div>
            </div>
        </div>

        <div class="form-group">
            <label for="label">Address Label</label>
            <select
                id="label"
                bind:value={address.label}
                disabled={isValidating}
            >
                <option value="Home">Home</option>
                <option value="Work">Work</option>
                <option value="Other">Other</option>
            </select>
        </div>

        <div class="form-group checkbox-group">
            <label>
                <input
                    type="checkbox"
                    bind:checked={address.is_default}
                    disabled={isValidating}
                />
                Set as default address
            </label>
        </div>

        <div class="form-actions">
            <button
                type="button"
                class="cancel-btn"
                on:click={handleCancel}
                disabled={isValidating}
            >
                Cancel
            </button>
            <button type="submit" class="submit-btn" disabled={isValidating}>
                {#if isValidating}
                    Validating...
                {:else}
                    {submitButtonText}
                {/if}
            </button>
        </div>
    </form>
</div>

<style>
    .address-form {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        padding: 24px;
        max-width: 500px;
        margin: 0 auto;
    }

    h2 {
        margin-top: 0;
        margin-bottom: 24px;
        font-size: 20px;
        text-align: center;
    }

    .validation-error {
        background-color: #ffebee;
        color: #c62828;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 16px;
        font-size: 14px;
    }

    .form-group {
        margin-bottom: 16px;
    }

    .form-row {
        display: flex;
        gap: 16px;
    }

    .form-row .form-group {
        flex: 1;
    }

    label {
        display: block;
        margin-bottom: 4px;
        font-size: 14px;
        font-weight: 500;
        color: #333;
    }

    input,
    select {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        font-size: 16px;
    }

    input:focus,
    select:focus {
        border-color: rgb(61, 61, 61);
        outline: none;
        box-shadow: 0 0 0 2px rgba(26, 139, 81, 0.2);
    }

    .state-zip-group {
        display: flex;
        gap: 12px;
    }

    .state-group {
        width: 80px;
    }

    .zip-group {
        flex: 1;
    }

    .checkbox-group {
        display: flex;
        align-items: center;
    }

    .checkbox-group label {
        display: flex;
        align-items: center;
        margin: 0;
        font-weight: normal;
        cursor: pointer;
    }

    .checkbox-group input {
        width: auto;
        margin-right: 8px;
    }

    .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;
    }

    button {
        padding: 10px 18px;
        border-radius: 4px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .submit-btn {
        background-color: rgb(61, 61, 61);
        color: white;
        border: none;
    }

    .submit-btn:hover:not(:disabled) {
        background: rgb(98, 98, 98);
    }

    .cancel-btn {
        background: white;
        color: #333;
        border: 1px solid #e0e0e0;
    }

    .cancel-btn:hover:not(:disabled) {
        background: #f5f5f5;
    }

    button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
</style>
