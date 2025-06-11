<script lang="ts">
    import { createEventDispatcher, onMount, getContext } from "svelte";
    import { encodeHashToBase64 } from "@holochain/client";
    import type { AddressService } from "../../services/AddressService";
    import type { CartBusinessService } from "../../services/CartBusinessService";
    import type { CheckoutDetails } from "../../services/CartBusinessService";
    import AddressSelector from "../address/AddressSelector.svelte";
    import DeliveryTimeSelector from "../address/DeliveryTimeSelector.svelte";
    import CheckoutSummary from "./CheckoutSummary.svelte";
    import { ChevronLeft } from "lucide-svelte";
    import { AnimationService } from "../../../services/AnimationService";

    // Import agent-avatar component
    import "@holochain-open-dev/profiles/dist/elements/agent-avatar.js";

    // Props
    export let client: any;
    export let cartService: CartBusinessService;
    export let cartItems: any[] = [];
    export let onClose: () => void;

    // Get the store for the client
    const storeContext =
        getContext<import("../../../store").StoreContext>("store");
    const store = storeContext.getStore();

    // Event dispatcher
    const dispatch = createEventDispatcher();

    // Get AddressService from context
    const addressService =
        getContext<Writable<AddressService | null>>("addressService");

    // State
    let currentStep = 1;
    let checkoutDetails: CheckoutDetails = {};
    let deliveryTimeSlots: any[] = [];
    let formattedDeliveryTime: { date: Date; display: string } | null = null;
    let isCheckingOut = false;
    let checkoutError = "";
    let isEntering = true;
    let isExiting = false;

    // Derive selected address from addressHash
    $: selectedAddress =
        checkoutDetails.addressHash && $addressService
            ? $addressService.getAddress(checkoutDetails.addressHash)
            : null;

    // Initialize with saved data and delivery time slots
    onMount(async () => {
        if (cartService) {
            // Generate delivery time slots
            deliveryTimeSlots = cartService.generateDeliveryTimeSlots();

            // Load saved delivery details if available
            const savedDetails = cartService.getSavedDeliveryDetails();
            console.log("Loaded saved delivery details:", savedDetails);

            if (savedDetails) {
                // Set checkout details from saved data
                checkoutDetails = { ...savedDetails };

                // Restore saved step
                if (savedDetails.currentStep) {
                    currentStep = savedDetails.currentStep;
                }

                // Use saved formatted delivery time directly
                if (savedDetails.formattedDeliveryTime) {
                    formattedDeliveryTime = savedDetails.formattedDeliveryTime;
                    console.log(
                        "Restored delivery time:",
                        formattedDeliveryTime,
                    );
                }
            }
        }
    });

    // Handle address selection
    function handleAddressSelect({ detail }: { detail: any }) {
        checkoutDetails.addressHash = detail.addressHash;
        checkoutDetails.currentStep = currentStep;
        cartService.setSavedDeliveryDetails(checkoutDetails);
    }

    // Handle delivery instructions change
    function handleInstructionsChange({ detail }: { detail: any }) {
        checkoutDetails.deliveryInstructions = detail.instructions;
        checkoutDetails.currentStep = currentStep;
        cartService.setSavedDeliveryDetails(checkoutDetails);
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
        checkoutDetails.formattedDeliveryTime = formattedDeliveryTime;
        checkoutDetails.currentStep = currentStep;
        cartService.setSavedDeliveryDetails(checkoutDetails);
    }

    // Validate the current state before proceeding to the next step
    function validateStep(currentStep: number): boolean {
        if (currentStep === 1) {
            return !!checkoutDetails.addressHash && !!selectedAddress;
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
        // Exit current step (same pattern as SlideOutCart)
        isEntering = false;
        isExiting = true;

        // Switch step and enter after exit completes
        setTimeout(() => {
            currentStep++;
            isExiting = false;
            isEntering = true;

            // Save the new step
            checkoutDetails.currentStep = currentStep;
            cartService.setSavedDeliveryDetails(checkoutDetails);
        }, AnimationService.getAnimationDuration("smooth"));
    }

    // Go back to previous step
    function goBack() {
        // Exit current step (same pattern as SlideOutCart)
        isEntering = false;
        isExiting = true;

        // Switch step and enter after exit completes
        setTimeout(() => {
            currentStep--;
            isExiting = false;
            isEntering = true;

            // Save the new step
            checkoutDetails.currentStep = currentStep;
            cartService.setSavedDeliveryDetails(checkoutDetails);
        }, AnimationService.getAnimationDuration("smooth"));
    }

    // Handle back to cart with exit animations
    function handleBackToCart() {
        // Save current state before closing
        checkoutDetails.currentStep = currentStep;
        cartService.setSavedDeliveryDetails(checkoutDetails);

        isEntering = false;
        isExiting = true;

        setTimeout(() => {
            onClose();
            // Reset animation states
            isEntering = true;
            isExiting = false;
        }, AnimationService.getAnimationDuration("smooth"));
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
    <div
        class="checkout-header {isEntering
            ? 'slide-in-down'
            : isExiting
              ? 'slide-out-up'
              : ''}"
    >
        <button
            class="back-button"
            on:click={currentStep > 1 ? goBack : handleBackToCart}
        >
            <ChevronLeft size={20} />
        </button>
        <h2
            class={isEntering
                ? "slide-in-down"
                : isExiting
                  ? "slide-out-up"
                  : ""}
        >
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

    <div
        class="checkout-content {currentStep === 3
            ? 'allow-scroll'
            : 'prevent-scroll'}"
    >
        {#if currentStep === 1}
            <div
                class="avatar-overlay {isEntering
                    ? 'slide-in-right'
                    : isExiting
                      ? 'slide-out-right'
                      : ''}"
            >
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
                selectedAddressHash={checkoutDetails.addressHash}
                deliveryInstructions={checkoutDetails.deliveryInstructions ||
                    ""}
                {isEntering}
                {isExiting}
                on:select={handleAddressSelect}
                on:instructionsChange={handleInstructionsChange}
            />

            <div
                class="nav-buttons {isEntering
                    ? 'slide-in-up'
                    : isExiting
                      ? 'slide-out-down'
                      : ''}"
            >
                <button
                    class="continue-btn"
                    on:click={continueToNextStep}
                    disabled={!checkoutDetails.addressHash}
                >
                    Continue to Delivery Time
                </button>
            </div>
        {:else if currentStep === 2}
            <div
                class="avatar-overlay {isEntering
                    ? 'slide-in-right'
                    : isExiting
                      ? 'slide-out-right'
                      : ''}"
            >
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
                {isEntering}
                {isExiting}
                on:select={handleTimeSelect}
            />

            <div
                class="nav-buttons {isEntering
                    ? 'slide-in-up'
                    : isExiting
                      ? 'slide-out-down'
                      : ''}"
            >
                <button
                    class="continue-btn"
                    on:click={continueToNextStep}
                    disabled={!checkoutDetails.deliveryTime}
                >
                    Continue to Review
                </button>
            </div>
        {:else if currentStep === 3}
            {#if selectedAddress && formattedDeliveryTime}
                <div
                    class="avatar-overlay {isEntering
                        ? 'slide-in-right'
                        : isExiting
                          ? 'slide-out-right'
                          : ''}"
                >
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
                    {cartItems}
                    address={selectedAddress}
                    deliveryInstructions={checkoutDetails.deliveryInstructions ||
                        ""}
                    deliveryTime={formattedDeliveryTime}
                    {isCheckingOut}
                    {cartService}
                    {isEntering}
                    {isExiting}
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
        padding: 0;
        display: flex;
        flex-direction: column;
        position: relative;
    }

    .checkout-content.allow-scroll {
        overflow-y: auto;
        overflow-x: hidden;
    }

    .checkout-content.prevent-scroll {
        overflow: hidden;
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
