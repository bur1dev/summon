<script lang="ts">
    import { onMount, createEventDispatcher } from "svelte";
    import { AddressService, type Address } from "./AddressService";
    import AddressForm from "./AddressForm.svelte";
    import { MapPin, NotebookPen } from "lucide-svelte";

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
                            <div class="address-icon">
                                <MapPin size={18} />
                            </div>
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
                                <span class="info-icon">
                                    <NotebookPen size={16} />
                                </span>
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
        background: var(--background);
        border-radius: var(--card-border-radius);
        width: 100%;
        box-shadow: var(--shadow-subtle);
    }

    .address-selector-header {
        height: var(--component-header-height); /* Explicit height */
        box-sizing: border-box; /* Include padding and border in the element's total width and height */
        padding: 0 var(--spacing-md); /* Adjust padding, left/right as needed */
        border-bottom: var(--border-width-thin) solid var(--border);
        background: var(--background);
        border-radius: var(--card-border-radius) var(--card-border-radius) 0 0;
        display: flex; /* To allow vertical alignment */
        align-items: center; /* Vertically center content */
    }

    .address-selector-header h2 {
        margin: 0;
        font-size: var(--spacing-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
    }

    .loading {
        padding: var(--spacing-xxl);
        text-align: center;
        color: var(--text-secondary);
    }

    .addresses-container {
        padding: var(--spacing-md);
    }

    .no-addresses {
        text-align: center;
        padding: var(--spacing-xxl) 0;
    }

    .no-addresses p {
        margin-bottom: var(--spacing-lg);
        color: var(--text-secondary);
    }

    .address-list {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
    }

    .address-card {
        display: flex;
        align-items: center;
        padding: var(--spacing-sm) var(--spacing-md);
        border: var(--border-width-thin) solid var(--border);
        border-radius: var(--btn-border-radius);
        cursor: pointer;
        transition: var(--btn-transition);
        background: var(--background);
    }

    .address-card:hover {
        transform: translateY(var(--hover-lift));
        border-color: var(--primary);
        box-shadow: var(--shadow-subtle);
    }

    .address-card.selected {
        border-color: var(--primary);
        background: linear-gradient(
            135deg,
            rgba(86, 98, 189, 0.1),
            rgba(112, 70, 168, 0.1)
        );
        transform: translateY(var(--hover-lift));
        box-shadow: var(--shadow-medium);
    }

    .address-icon {
        margin-right: var(--spacing-sm);
        color: var(--primary);
    }

    :global(.address-icon svg) {
        color: var(--primary);
        stroke: var(--primary);
    }

    .address-card-content {
        flex: 1;
    }

    .address-label {
        font-weight: var(--font-weight-semibold);
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        color: var(--text-primary);
    }

    .default-badge {
        background: linear-gradient(
            135deg,
            rgba(86, 98, 189, 0.2),
            rgba(112, 70, 168, 0.2)
        );
        color: var(--primary);
        font-size: var(--font-size-sm);
        padding: 2px 6px;
        border-radius: var(--btn-border-radius);
        margin-left: var(--spacing-xs);
        font-weight: var(--font-weight-semibold);
    }

    .address-line {
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
        line-height: 1.4;
    }

    .unit {
        margin-left: 4px;
    }

    .address-card-selector {
        margin-left: var(--spacing-md);
    }

    .radio-circle {
        width: 20px;
        height: 20px;
        border: var(--border-width) solid var(--border);
        border-radius: 50%;
        position: relative;
        transition: var(--btn-transition);
    }

    .radio-circle.checked {
        border-color: var(--primary);
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
        background: linear-gradient(135deg, var(--primary), var(--secondary));
    }

    .add-address-btn {
        display: block;
        width: 100%;
        height: var(--btn-height-md);
        margin-top: var(--spacing-sm);
        background-color: var(--surface);
        border: var(--border-width-thin) dashed var(--primary);
        border-radius: var(--btn-border-radius);
        color: var(--primary);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        transition: var(--btn-transition);
    }

    .add-address-btn:hover {
        background-color: rgba(86, 98, 189, 0.1);
        transform: translateY(var(--hover-lift));
        box-shadow: var(--shadow-subtle);
    }

    .instructions-container {
        margin-top: var(--spacing-xl);
        padding-top: var(--spacing-md);
        border-top: var(--border-width-thin) solid var(--border);
    }

    .instructions-container h3 {
        font-size: var(--font-size-md);
        margin-top: 0;
        margin-bottom: var(--spacing-xs);
        color: var(--text-primary);
    }

    textarea {
        width: 100%;
        padding: var(--spacing-sm);
        border: var(--border-width-thin) solid var(--border);
        border-radius: var(--btn-border-radius);
        font-size: var(--font-size-sm);
        resize: vertical;
        background: var(--background);
        color: var(--text-primary);
        transition: var(--btn-transition);
        box-sizing: border-box;
    }

    textarea:focus {
        border-color: var(--primary);
        outline: none;
        box-shadow: 0 0 0 2px rgba(86, 98, 189, 0.2);
    }

    .instructions-info {
        margin-top: var(--spacing-sm);
    }

    .info-item {
        display: flex;
        align-items: center;
        font-size: var(--font-size-sm);
        color: var(--text-secondary);
    }

    .info-icon {
        margin-right: var(--spacing-xs);
    }

    :global(.info-icon svg) {
        color: var(--text-secondary);
        stroke: var(--text-secondary);
    }
</style>
