<script lang="ts">
    import { createEventDispatcher, onMount, getContext } from "svelte";
    import {
        encodeHashToBase64,
        decodeHashFromBase64,
    } from "@holochain/client";
    import { AddressService } from "../services/AddressService";
    import type { Address } from "../services/AddressService";
    import type { CartBusinessService } from "../services/CartBusinessService";
    import type {
        DeliveryTimeSlot,
        CheckoutDetails,
    } from "../services/CartBusinessService";
    import AddressSelector from "./AddressSelector.svelte";
    import DeliveryTimeSelector from "./DeliveryTimeSelector.svelte";
    import CheckoutSummary from "./CheckoutSummary.svelte";
    import { decode } from "@msgpack/msgpack";
    import { ChevronLeft } from "lucide-svelte";

    // Define an interface for the decoded product group
    interface ProductGroup {
        products: any[];
    }

    // Import agent-avatar component
    import "@holochain-open-dev/profiles/dist/elements/agent-avatar.js";

    // Props
    export let client: any;
    export let cartService: CartBusinessService;
    export let cartItems: any[] = [];
    export let onClose: () => void;

    let cartTotal = 0; // This was an export, now a local variable if needed internally, or remove if not.
    // Based on the previous error, it's not used by CheckoutSummary.
    // If it's used elsewhere in THIS component, it can remain as `let cartTotal = 0;`
    // If not used at all, it can be removed entirely.
    // For now, I'll keep it as a local variable declaration.

    // Get the store for the client
    const storeContext = getContext<import("../store").StoreContext>("store");
    const store = storeContext.getStore();

    // Get profiles store from context
    const profilesStore = getContext("profiles-store");

    // Event dispatcher
    const dispatch = createEventDispatcher();

    // State
    let currentStep = 1;
    let checkoutDetails: CheckoutDetails = {};
    let deliveryTimeSlots: any[] = [];
    let formattedDeliveryTime: { date: Date; display: string } | null = null;
    let address: Address | null = null;
    let isCheckingOut = false;
    let checkoutError = "";
    let addressService: AddressService | null = null;
    let localCartItems: any[] = [];
    let unsubscribe: (() => void) | null = null;
    let enrichedCartItems: any[] = []; // New state for cart items with product details

    // Subscribe to cart service for real-time updates
    onMount(() => {
        if (cartService && typeof cartService.subscribe === "function") {
            unsubscribe = cartService.subscribe(async (items: any[]) => {
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
            enrichCartItems(localCartItems).then((items: any[]) => {
                enrichedCartItems = items;
            });
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
    });

    // Helper function to enrich cart items with product details
    async function enrichCartItems(items: any[]): Promise<any[]> {
        console.log("Enriching cart items with product details:", items.length);

        if (!items || !items.length) return [];

        const enrichedItems = await Promise.all(
            items.map(async (item: any) => {
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
                    const result = await store!.client.callZome({
                        role_name: "grocery",
                        zome_name: "products",
                        fn_name: "get_product_group",
                        payload: groupHash,
                    });

                    if (
                        result &&
                        result.entry &&
                        result.entry.Present &&
                        result.entry.Present.entry
                    ) {
                        const group = decode(
                            result.entry.Present.entry,
                        ) as ProductGroup;

                        // Get specific product by index
                        if (
                            group &&
                            group.products &&
                            item.productIndex < group.products.length && // Add bounds check
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
    async function loadAddress(addressHash: any): Promise<Address | null> {
        if (!addressService || !addressHash) return null;

        console.log("Loading address from hash:", addressHash);
        try {
            // Get addresses from the service
            const addresses = addressService.getAddresses();
            // Subscribe to the store to get the latest value
            return new Promise((resolve) => {
                const unsubscribe = addresses.subscribe(
                    (addressMap: Map<string, Address>) => {
                        if (addressMap.has(addressHash)) {
                            unsubscribe();
                            resolve(addressMap.get(addressHash) || null);
                        }
                    },
                );

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
    function handleAddressSelect({ detail }: { detail: any }) {
        checkoutDetails.addressHash = detail.addressHash;
        address = detail.address;
    }

    // Handle delivery instructions change
    function handleInstructionsChange({ detail }: { detail: any }) {
        checkoutDetails.deliveryInstructions = detail.instructions;
    }

    // Handle delivery time selection
    function handleTimeSelect({ detail }: { detail: any }) {
        checkoutDetails.deliveryTime = detail.deliveryTime;

        // Format for display
        const dateObj = new Date(detail.deliveryTime.date);
        formattedDeliveryTime = {
            date: dateObj,
            display: detail.deliveryTime.time_slot,
        };
    }

    // Validate the current state before proceeding to the next step
    function validateStep(currentStep: number): boolean {
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
        } catch (error: unknown) {
            console.error("Error during checkout:", error);
            checkoutError = (error as Error).toString();
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
            <ChevronLeft size={20} />
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
                        agent-pub-key={store?.myAgentPubKeyB64}
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
                        agent-pub-key={store?.myAgentPubKeyB64}
                        disable-tooltip={true}
                        disable-copy={true}
                    ></agent-avatar>
                </div>
            </div>

            <DeliveryTimeSelector
                timeSlots={deliveryTimeSlots}
                selectedDate={checkoutDetails.deliveryTime?.date
                    ? new Date(checkoutDetails.deliveryTime.date)
                    : null}
                selectedTimeSlot={checkoutDetails.deliveryTime?.time_slot ||
                    null}
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
                            agent-pub-key={store?.myAgentPubKeyB64}
                            disable-tooltip={true}
                            disable-copy={true}
                        ></agent-avatar>
                    </div>
                </div>

                <CheckoutSummary
                    cartItems={effectiveCartItems}
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
        background: var(--background);
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .checkout-header {
        height: var(--component-header-height);
        box-sizing: border-box;
        padding: 0 var(--spacing-md);
        border-bottom: none;
        display: flex;
        align-items: center;
        position: relative;
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        color: var(--button-text);
    }

    .checkout-header h2 {
        flex-grow: 1;
        text-align: center;
        margin: 0;
        font-size: var(--btn-font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--button-text);
    }

    .back-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--btn-icon-size-sm);
        height: var(--btn-icon-size-sm);
        background: rgba(255, 255, 255, 0.2);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        transition: var(--btn-transition);
    }

    .back-button:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(var(--hover-scale));
    }

    :global(.back-button svg) {
        color: var(--button-text);
        stroke: var(--button-text);
    }

    .steps-indicator {
        font-size: var(--font-size-sm);
        color: rgba(255, 255, 255, 0.8);
        padding: 4px var(--spacing-xs);
        background: rgba(0, 0, 0, 0.1);
        border-radius: var(--btn-border-radius);
    }

    .avatar-overlay {
        position: absolute;
        top: 14px;
        right: var(--spacing-lg);
        z-index: var(--z-index-sticky);
        display: flex;
    }

    .avatar-container {
        border: var(--border-width) solid var(--primary);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--background);
        box-shadow: var(--shadow-subtle);
        transition: var(--btn-transition);
    }

    .avatar-container:hover {
        transform: scale(var(--hover-scale));
        box-shadow: var(--shadow-medium);
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
        padding: var(--spacing-lg);
        background: var(--background);
        border-top: var(--border-width-thin) solid var(--border);
        margin-top: auto;
    }

    .continue-btn {
        width: 100%;
        height: var(--btn-height-lg);
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        border: none;
        color: var(--button-text);
        border-radius: var(--btn-border-radius);
        font-size: var(--btn-font-size-md);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        text-align: center;
        transition: var(--btn-transition);
        box-shadow: var(--shadow-button);
    }

    .continue-btn:hover:not(:disabled) {
        background: linear-gradient(
            135deg,
            var(--primary-dark),
            var(--secondary)
        );
        transform: translateY(var(--hover-lift));
        box-shadow: var(--shadow-medium);
    }

    .continue-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        background: var(--surface);
        color: var(--text-secondary);
        border: var(--border-width-thin) solid var(--border);
        box-shadow: none;
    }

    .checkout-error {
        margin: var(--spacing-md);
        padding: var(--spacing-sm);
        background-color: rgba(211, 47, 47, 0.1);
        color: var(--error);
        border-radius: var(--card-border-radius);
        font-size: var(--font-size-sm);
        border-left: 3px solid var(--error);
    }

    .missing-info {
        padding: var(--spacing-xxl);
        text-align: center;
        color: var(--text-primary);
    }

    .back-btn {
        padding: var(--btn-padding-md);
        background: var(--surface);
        border: var(--border-width-thin) solid var(--border);
        border-radius: var(--btn-border-radius);
        margin-top: var(--spacing-md);
        cursor: pointer;
        transition: var(--btn-transition);
        color: var(--text-primary);
    }

    .back-btn:hover {
        background: var(--background);
        border-color: var(--primary);
        transform: translateY(var(--hover-lift));
        box-shadow: var(--shadow-subtle);
    }
</style>
