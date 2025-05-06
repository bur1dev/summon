<script lang="ts">
    import { createEventDispatcher, onMount, getContext } from "svelte";
    import {
        encodeHashToBase64,
        decodeHashFromBase64,
    } from "@holochain/client";
    import { AddressService, type Address } from "./AddressService";
    import type {
        DeliveryTimeSlot,
        CheckoutDetails,
    } from "./SimpleCartService";
    import AddressSelector from "./AddressSelector.svelte";
    import DeliveryTimeSelector from "./DeliveryTimeSelector.svelte";
    import CheckoutSummary from "./CheckoutSummary.svelte";
    import { decode } from "@msgpack/msgpack";

    // Import agent-avatar component
    import "@holochain-open-dev/profiles/dist/elements/agent-avatar.js";

    // Props
    export let client: any;
    export let cartService: any;
    export let cartItems = [];
    export let productDetails = {};
    export let cartTotal = 0;
    export let onClose: () => void;

    // Get the store for the client
    const { getStore } = getContext("store");
    const store = getStore();

    // Get profiles store from context
    const profilesStore = getContext("profiles-store");

    // Event dispatcher
    const dispatch = createEventDispatcher();

    // State
    let currentStep = 1;
    let checkoutDetails: CheckoutDetails = {};
    let deliveryTimeSlots = [];
    let formattedDeliveryTime = null;
    let address = null;
    let isCheckingOut = false;
    let checkoutError = "";
    let addressService = null;
    let localCartItems = [];
    let unsubscribe: any;
    let enrichedCartItems = []; // New state for cart items with product details

    // Subscribe to cart service for real-time updates
    onMount(() => {
        if (cartService && typeof cartService.subscribe === "function") {
            unsubscribe = cartService.subscribe(async (items) => {
                localCartItems = items || [];
                console.log(
                    "Cart items updated in CheckoutFlow:",
                    localCartItems.length,
                );

                // Enrich cart items with product details
                enrichedCartItems = await enrichCartItems(localCartItems);
            });
        } else {
            localCartItems = cartItems;
            // Enrich initial cart items
            enrichCartItems(localCartItems).then((items) => {
                enrichedCartItems = items;
            });
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
    });

    // Helper function to enrich cart items with product details
    async function enrichCartItems(items) {
        console.log("Enriching cart items with product details:", items.length);

        if (!items || !items.length) return [];

        const enrichedItems = await Promise.all(
            items.map(async (item) => {
                try {
                    if (!item.groupHash) {
                        console.error("Item missing groupHash:", item);
                        return {
                            ...item,
                            productDetails: null,
                        };
                    }

                    // Convert groupHash if needed
                    let groupHashBase64 = item.groupHash;
                    if (
                        typeof item.groupHash === "string" &&
                        item.groupHash.includes(",")
                    ) {
                        const byteArray = new Uint8Array(
                            item.groupHash.split(",").map(Number),
                        );
                        groupHashBase64 = encodeHashToBase64(byteArray);
                    }

                    // Fetch product group
                    const groupHash = decodeHashFromBase64(groupHashBase64);
                    const result = await store.client.callZome({
                        role_name: "grocery",
                        zome_name: "products",
                        fn_name: "get_product_group",
                        payload: groupHash,
                    });

                    if (result) {
                        const group = decode(result.entry.Present.entry);

                        // Get specific product by index
                        if (
                            group &&
                            group.products &&
                            group.products[item.productIndex]
                        ) {
                            return {
                                ...item,
                                productDetails:
                                    group.products[item.productIndex],
                            };
                        }
                    }

                    return {
                        ...item,
                        productDetails: null,
                    };
                } catch (error) {
                    console.error("Error enriching cart item:", error);
                    return {
                        ...item,
                        productDetails: null,
                    };
                }
            }),
        );

        console.log("Enriched cart items:", enrichedItems);
        return enrichedItems;
    }

    // Computed properties for items with details
    $: effectiveCartItems =
        enrichedCartItems.length > 0
            ? enrichedCartItems
            : localCartItems.length > 0
              ? localCartItems
              : cartItems;

    // Load address from hash
    async function loadAddress(addressHash) {
        if (!addressService || !addressHash) return null;

        console.log("Loading address from hash:", addressHash);
        try {
            // Get addresses from the service
            const addresses = addressService.getAddresses();
            // Subscribe to the store to get the latest value
            return new Promise((resolve) => {
                const unsubscribe = addresses.subscribe((addressMap) => {
                    if (addressMap.has(addressHash)) {
                        unsubscribe();
                        resolve(addressMap.get(addressHash));
                    }
                });

                // Add a timeout to prevent hanging
                setTimeout(() => {
                    unsubscribe();
                    resolve(null);
                }, 2000);
            });
        } catch (error) {
            console.error("Error loading address:", error);
            return null;
        }
    }

    // Initialize with saved data and delivery time slots
    onMount(async () => {
        if (cartService) {
            // Generate delivery time slots
            deliveryTimeSlots = cartService.generateDeliveryTimeSlots();

            // Initialize address service
            if (client) {
                addressService = new AddressService(client);
            }

            // Load saved delivery details if available
            const savedDetails = cartService.getSavedDeliveryDetails();
            console.log("Loaded saved delivery details:", savedDetails);

            if (savedDetails) {
                // Set checkout details from saved data
                checkoutDetails = { ...savedDetails };

                // If we have a saved delivery time, format it for display
                if (savedDetails.deliveryTime) {
                    const dateObj = new Date(savedDetails.deliveryTime.date);
                    formattedDeliveryTime = {
                        date: dateObj,
                        display: savedDetails.deliveryTime.time_slot,
                    };
                    console.log(
                        "Restored delivery time:",
                        formattedDeliveryTime,
                    );
                }

                // If we have a saved address hash, load the address details
                if (savedDetails.addressHash && addressService) {
                    address = await loadAddress(savedDetails.addressHash);
                    console.log("Loaded address:", address);
                }
            }
        }
    });

    // Handle address selection
    function handleAddressSelect({ detail }) {
        checkoutDetails.addressHash = detail.addressHash;
        address = detail.address;
    }

    // Handle delivery instructions change
    function handleInstructionsChange({ detail }) {
        checkoutDetails.deliveryInstructions = detail.instructions;
    }

    // Handle delivery time selection
    function handleTimeSelect({ detail }) {
        checkoutDetails.deliveryTime = detail.deliveryTime;

        // Format for display
        const dateObj = new Date(detail.deliveryTime.date);
        formattedDeliveryTime = {
            date: dateObj,
            display: detail.deliveryTime.time_slot,
        };
    }

    // Validate the current state before proceeding to the next step
    function validateStep(currentStep) {
        if (currentStep === 1) {
            return !!checkoutDetails.addressHash && !!address;
        }

        if (currentStep === 2) {
            return !!checkoutDetails.deliveryTime && !!formattedDeliveryTime;
        }

        return true;
    }

    // Navigation between steps
    function goToStep(step: number) {
        // Validate the current step before proceeding
        if (step > currentStep && !validateStep(currentStep)) {
            console.error(
                `Cannot proceed to step ${step}, current step ${currentStep} is not valid`,
            );
            return;
        }

        currentStep = step;
    }

    // Continue to next step
    function continueToNextStep() {
        goToStep(currentStep + 1);
    }

    // Go back to previous step
    function goBack() {
        goToStep(currentStep - 1);
    }

    // Place the order
    async function placeOrder() {
        if (!checkoutDetails.addressHash || !checkoutDetails.deliveryTime) {
            checkoutError = "Please complete all required information";
            return;
        }

        isCheckingOut = true;
        checkoutError = "";

        try {
            console.log("Placing order with details:", checkoutDetails);

            const result = await cartService.checkoutCart(checkoutDetails);

            if (result.success) {
                // Dispatch success event
                dispatch("checkout-success", {
                    cartHash: encodeHashToBase64(result.data),
                    details: checkoutDetails,
                });

                // Close the checkout flow
                onClose();
            } else {
                console.error("Checkout failed:", result.message);
                checkoutError =
                    result.message || "Checkout failed. Please try again.";
            }
        } catch (error) {
            console.error("Error during checkout:", error);
            checkoutError = error.toString();
        } finally {
            isCheckingOut = false;
        }
    }
</script>

<div class="checkout-flow">
    <div class="checkout-header">
        <button
            class="back-button"
            on:click={currentStep > 1 ? goBack : onClose}
        >
            ←
        </button>
        <h2>
            {#if currentStep === 1}
                Delivery Address
            {:else if currentStep === 2}
                Delivery Time
            {:else}
                Review & Place Order
            {/if}
        </h2>
        <div class="steps-indicator">
            Step {currentStep} of 3
        </div>
    </div>

    <div class="checkout-content">
        {#if currentStep === 1}
            <div class="avatar-overlay">
                <div class="avatar-container">
                    <agent-avatar
                        size="40"
                        agent-pub-key={store.myAgentPubKeyB64}
                        disable-tooltip={true}
                        disable-copy={true}
                    ></agent-avatar>
                </div>
            </div>

            <AddressSelector
                {client}
                selectedAddressHash={checkoutDetails.addressHash}
                deliveryInstructions={checkoutDetails.deliveryInstructions ||
                    ""}
                on:select={handleAddressSelect}
                on:instructionsChange={handleInstructionsChange}
            />

            <div class="nav-buttons">
                <button
                    class="continue-btn"
                    on:click={continueToNextStep}
                    disabled={!checkoutDetails.addressHash}
                >
                    Continue to Delivery Time
                </button>
            </div>
        {:else if currentStep === 2}
            <div class="avatar-overlay">
                <div class="avatar-container">
                    <agent-avatar
                        size="40"
                        agent-pub-key={store.myAgentPubKeyB64}
                        disable-tooltip={true}
                        disable-copy={true}
                    ></agent-avatar>
                </div>
            </div>

            <DeliveryTimeSelector
                timeSlots={deliveryTimeSlots}
                selectedTimeSlot={checkoutDetails.deliveryTime?.time_slot}
                selectedDate={checkoutDetails.deliveryTime
                    ? new Date(checkoutDetails.deliveryTime.date)
                    : null}
                on:select={handleTimeSelect}
            />

            <div class="nav-buttons">
                <button
                    class="continue-btn"
                    on:click={continueToNextStep}
                    disabled={!checkoutDetails.deliveryTime}
                >
                    Continue to Review
                </button>
            </div>
        {:else if currentStep === 3}
            {#if address && formattedDeliveryTime}
                <div class="avatar-overlay">
                    <div class="avatar-container">
                        <agent-avatar
                            size="40"
                            agent-pub-key={store.myAgentPubKeyB64}
                            disable-tooltip={true}
                            disable-copy={true}
                        ></agent-avatar>
                    </div>
                </div>

                <CheckoutSummary
                    cartItems={effectiveCartItems}
                    {cartTotal}
                    {address}
                    deliveryInstructions={checkoutDetails.deliveryInstructions ||
                        ""}
                    deliveryTime={formattedDeliveryTime}
                    {isCheckingOut}
                    {cartService}
                    on:placeOrder={placeOrder}
                    on:editAddress={() => goToStep(1)}
                    on:editTime={() => goToStep(2)}
                />

                {#if checkoutError}
                    <div class="checkout-error">
                        {checkoutError}
                    </div>
                {/if}
            {:else}
                <div class="missing-info">
                    <p>
                        Missing required information. Please go back and
                        complete all steps.
                    </p>
                    <button class="back-btn" on:click={goBack}>Go Back</button>
                </div>
            {/if}
        {/if}
    </div>
</div>

<style>
    .checkout-flow {
        background: white;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .checkout-header {
        padding: 16px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        align-items: center;
        position: relative;
    }

    .checkout-header h2 {
        flex-grow: 1;
        text-align: center;
        margin: 0;
        font-size: 18px;
        font-weight: 600;
    }

    .back-button {
        background: transparent;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        color: #333;
    }

    .steps-indicator {
        font-size: 14px;
        color: #666;
    }

    .avatar-overlay {
        position: absolute;
        top: 10px;
        right: 20px;
        z-index: 10;
        display: flex;
    }

    .avatar-container {
        border: 1px solid #e0e0e0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .checkout-content {
        flex: 1;
        overflow-y: auto;
        padding: 0;
        display: flex;
        flex-direction: column;
        position: relative;
    }

    .nav-buttons {
        padding: 20px;
        background: white;
        border-top: 1px solid #f0f0f0;
        margin-top: auto;
    }

    .continue-btn {
        width: 100%;
        padding: 14px;
        background: rgb(61, 61, 61);
        border: none;
        color: white;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        transition: background-color 0.2s;
    }

    .continue-btn:hover:not(:disabled) {
        background: rgb(98, 98, 98);
    }

    .continue-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .checkout-error {
        margin: 16px;
        padding: 12px;
        background-color: #ffebee;
        color: #c62828;
        border-radius: 4px;
        font-size: 14px;
    }

    .missing-info {
        padding: 30px;
        text-align: center;
    }

    .back-btn {
        padding: 10px 18px;
        background: #f5f5f5;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        margin-top: 16px;
        cursor: pointer;
    }
</style>
