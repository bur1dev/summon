<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { AddressService, type Address } from "./AddressService";
    import AddressForm from "./AddressForm.svelte";

    // Props
    export let client: any;
    export let selectedAddressHash: string | null = null;
    export let deliveryInstructions: string = "";

    // Event dispatcher
    const dispatch = createEventDispatcher();

    // Services
    let addressService: AddressService;
    let addresses = new Map<string, Address>();
    let loading = true;

    // UI state
    let showNewAddressForm = false;
    let isValidating = false;
    let validationError = "";

    onMount(async () => {
        addressService = new AddressService(client);

        // Subscribe to addresses
        const unsubscribe = addressService.getAddresses().subscribe((value) => {
            addresses = value;
            loading = false;

            // If no address is selected but we have addresses, select the default
            if (!selectedAddressHash && addresses.size > 0) {
                const defaultAddress = addressService.getDefaultAddress();
                if (defaultAddress) {
                    selectedAddressHash = defaultAddress.hash;
                    dispatch("select", {
                        addressHash: defaultAddress.hash,
                        address: defaultAddress.address,
                    });
                }
            }
        });

        return () => {
            unsubscribe();
        };
    });

    // Handle address selection
    function selectAddress(addressHash: string) {
        selectedAddressHash = addressHash;
        const address = addresses.get(addressHash);
        if (address) {
            dispatch("select", { addressHash, address });
        }
    }

    // Add new address
    async function handleAddAddress(event) {
        isValidating = true;
        validationError = "";

        const newAddress = event.detail.address;

        // Validate the address using OpenStreetMap
        const validation = await addressService.validateAddress(newAddress);

        if (validation.valid) {
            // Update with coordinates
            newAddress.lat = validation.lat;
            newAddress.lng = validation.lng;

            // Save the address
            const result = await addressService.createAddress(newAddress);

            if (result.success) {
                // Select the new address
                selectAddress(result.hash);
                showNewAddressForm = false;
            } else {
                validationError = "Failed to save address. Please try again.";
            }
        } else {
            validationError =
                validation.message ||
                "Address validation failed. Please check your address.";
        }

        isValidating = false;
    }

    // Update delivery instructions
    function handleInstructionsChange() {
        dispatch("instructionsChange", { instructions: deliveryInstructions });
    }

    // Cancel add address
    function handleCancelAddAddress() {
        showNewAddressForm = false;
        validationError = "";
    }
</script>

<div class="address-selector">
    <div class="address-selector-header">
        <h2>Select Delivery Address</h2>
    </div>

    {#if loading}
        <div class="loading">Loading addresses...</div>
    {:else if showNewAddressForm}
        <AddressForm
            on:submit={handleAddAddress}
            on:cancel={handleCancelAddAddress}
            {isValidating}
            {validationError}
        />
    {:else}
        <div class="addresses-container">
            {#if addresses.size === 0}
                <div class="no-addresses">
                    <p>You don't have any saved addresses.</p>
                    <button
                        class="add-address-btn"
                        on:click={() => (showNewAddressForm = true)}
                    >
                        Add New Address
                    </button>
                </div>
            {:else}
                <div class="address-list">
                    {#each [...addresses.entries()] as [hash, address]}
                        <div
                            class="address-card {selectedAddressHash === hash
                                ? 'selected'
                                : ''}"
                            on:click={() => selectAddress(hash)}
                        >
                            <div class="address-card-content">
                                <div class="address-label">
                                    {address.label || "Address"}
                                    {#if address.is_default}
                                        <span class="default-badge"
                                            >Default</span
                                        >
                                    {/if}
                                </div>
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
                            </div>
                            <div class="address-card-selector">
                                <div
                                    class="radio-circle {selectedAddressHash ===
                                    hash
                                        ? 'checked'
                                        : ''}"
                                ></div>
                            </div>
                        </div>
                    {/each}

                    <button
                        class="add-address-btn"
                        on:click={() => (showNewAddressForm = true)}
                    >
                        + Add New Address
                    </button>
                </div>

                {#if selectedAddressHash}
                    <div class="instructions-container">
                        <h3>Delivery Instructions</h3>
                        <textarea
                            bind:value={deliveryInstructions}
                            on:change={handleInstructionsChange}
                            placeholder="Add delivery instructions (optional)"
                            rows="3"
                        ></textarea>
                        <div class="instructions-info">
                            <div class="info-item">
                                <span class="info-icon">📋</span>
                                Enter gate codes, building info, or where to leave
                                the delivery
                            </div>
                        </div>
                    </div>
                {/if}
            {/if}
        </div>
    {/if}
</div>

<style>
    .address-selector {
        background: white;
        border-radius: 8px;
        width: 100%;
    }

    .address-selector-header {
        padding: 16px;
        border-bottom: 1px solid #f0f0f0;
    }

    .address-selector-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
    }

    .loading {
        padding: 30px;
        text-align: center;
        color: #666;
    }

    .addresses-container {
        padding: 16px;
    }

    .no-addresses {
        text-align: center;
        padding: 30px 0;
    }

    .no-addresses p {
        margin-bottom: 20px;
        color: #666;
    }

    .address-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .address-card {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        transition:
            border-color 0.2s,
            background-color 0.2s;
    }

    .address-card:hover {
        background-color: #f9f9f9;
    }

    .address-card.selected {
        border-color: rgb(61, 61, 61);
        background-color: rgba(26, 139, 81, 0.05);
    }

    .address-card-content {
        flex: 1;
    }

    .address-label {
        font-weight: 600;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
    }

    .default-badge {
        background-color: #e8f5e9;
        color: rgb(61, 61, 61);
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 4px;
        margin-left: 8px;
        font-weight: normal;
    }

    .address-line {
        color: #666;
        font-size: 14px;
        line-height: 1.4;
    }

    .unit {
        margin-left: 4px;
    }

    .address-card-selector {
        margin-left: 16px;
    }

    .radio-circle {
        width: 20px;
        height: 20px;
        border: 2px solid #e0e0e0;
        border-radius: 50%;
        position: relative;
    }

    .radio-circle.checked {
        border-color: rgb(61, 61, 61);
    }

    .radio-circle.checked::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: rgb(61, 61, 61);
    }

    .add-address-btn {
        display: block;
        width: 100%;
        padding: 12px;
        margin-top: 12px;
        background-color: transparent;
        border: 1px dashed rgb(61, 61, 61);
        border-radius: 8px;
        color: rgb(61, 61, 61);
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .add-address-btn:hover {
        background-color: rgba(26, 139, 81, 0.05);
    }

    .instructions-container {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #f0f0f0;
    }

    .instructions-container h3 {
        font-size: 16px;
        margin-top: 0;
        margin-bottom: 8px;
    }

    textarea {
        width: 100%;
        padding: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        font-size: 14px;
        resize: vertical;
    }

    textarea:focus {
        border-color: rgb(61, 61, 61);
        outline: none;
        box-shadow: 0 0 0 2px rgba(26, 139, 81, 0.1);
    }

    .instructions-info {
        margin-top: 12px;
    }

    .info-item {
        display: flex;
        align-items: center;
        font-size: 13px;
        color: #666;
    }

    .info-icon {
        margin-right: 8px;
    }
</style>
