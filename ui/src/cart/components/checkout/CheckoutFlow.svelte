<script lang="ts">
    import { createEventDispatcher, onMount, getContext } from "svelte";
    import { encodeHashToBase64 } from "@holochain/client";
    import { getAddress } from "../../services/AddressService";
    // CartBusinessService no longer needed as prop
    import { checkoutCart, generateDeliveryTimeSlots, getSavedDeliveryDetails, setSavedDeliveryDetails } from "../../services/CheckoutService";
    import type { CheckoutDetails } from "../../types/CartTypes";
    import AddressSelector from "../address/AddressSelector.svelte";
    import DeliveryTimeSelector from "../address/DeliveryTimeSelector.svelte";
    import CheckoutSummary from "./CheckoutSummary.svelte";
    import { ChevronLeft } from "lucide-svelte";
    import { AnimationService } from "../../../services/AnimationService";

    // Import agent-avatar component
    import "@holochain-open-dev/profiles/dist/elements/agent-avatar.js";

    // Props
    export let cartItems: any[] = [];
    export let onClose: () => void;
    export let isClosingCart = false;

    // Get the store for the client
    const storeContext =
        getContext<import("../../../store").StoreContext>("store");
    const store = storeContext.getStore();

    // Event dispatcher
    const dispatch = createEventDispatcher();



    // State
    let currentStep = 1;
    let checkoutDetails: CheckoutDetails = {};
    let deliveryTimeSlots: any[] = [];
    let checkoutError = "";
    let isEntering = true;
    let isExiting = false;

    // Animation (EXACT SlideOutCart pattern)
    let checkoutContainer: HTMLElement | undefined;
    let hasTriggeredCheckoutZipper = false;

    // Reset flag when entering step 3 (EXACT SlideOutCart pattern)
    $: if (currentStep === 3) {
        hasTriggeredCheckoutZipper = false;
        // Clean up any leftover animation classes when entering step 3
        if (checkoutContainer) {
            checkoutContainer.classList.remove("zipper-enter", "zipper-exit");
        }
    }

    // When cart is closing, trigger exit animations on all elements
    $: if (isClosingCart) {
        isEntering = false;
        isExiting = true;
    }

    // When cart is closing from step 3, trigger zipper animation
    $: if (isClosingCart && currentStep === 3 && checkoutContainer) {
        AnimationService.stopCartZipper(checkoutContainer);
    }

    // Derive selected address from addressHash
    $: selectedAddress =
        checkoutDetails.addressHash
            ? getAddress(checkoutDetails.addressHash)
            : null;

    // Derive formatted delivery time from saved checkout details
    $: formattedDeliveryTime = checkoutDetails.deliveryTime
        ? {
              date: new Date(checkoutDetails.deliveryTime.date),
              display: checkoutDetails.deliveryTime.time_slot,
          }
        : null;

    // Trigger zipper animation when step 3 loads (EXACT SlideOutCart pattern)
    $: if (
        currentStep === 3 &&
        cartItems.length > 0 &&
        checkoutContainer &&
        !hasTriggeredCheckoutZipper
    ) {
        AnimationService.startCartZipper(checkoutContainer);
        hasTriggeredCheckoutZipper = true;

        // Remove the animation class after it completes to prevent re-animation on DOM changes
        setTimeout(() => {
            if (checkoutContainer) {
                checkoutContainer.classList.remove("zipper-enter");
            }
        }, AnimationService.getAnimationDuration("smooth"));
    }

    // Initialize with saved data and delivery time slots
    onMount(async () => {
        // Generate delivery time slots
        deliveryTimeSlots = generateDeliveryTimeSlots();

        // Load saved delivery details if available
        const savedDetails = getSavedDeliveryDetails();
        console.log("Loaded saved delivery details:", savedDetails);

        if (savedDetails) {
            // Set checkout details from saved data
            checkoutDetails = { ...savedDetails };

            // Restore saved step
            if (savedDetails.currentStep) {
                currentStep = savedDetails.currentStep;
            }
        }
    });

    // Handle address selection
    function handleAddressSelect({ detail }: { detail: any }) {
        checkoutDetails.addressHash = detail.addressHash;
        checkoutDetails.currentStep = currentStep;
setSavedDeliveryDetails(checkoutDetails);
    }

    // Handle delivery instructions change
    function handleInstructionsChange({ detail }: { detail: any }) {
        checkoutDetails.deliveryInstructions = detail.instructions;
        checkoutDetails.currentStep = currentStep;
setSavedDeliveryDetails(checkoutDetails);
    }

    // Handle delivery time selection
    function handleTimeSelect({ detail }: { detail: any }) {
        checkoutDetails.deliveryTime = detail.deliveryTime;
        checkoutDetails.currentStep = currentStep;
setSavedDeliveryDetails(checkoutDetails);
    }

    // Validate the current state before proceeding to the next step
    function validateStep(currentStep: number): boolean {
        if (currentStep === 1) {
            return !!checkoutDetails.addressHash && !!selectedAddress;
        }

        if (currentStep === 2) {
            return !!checkoutDetails.deliveryTime;
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
    setSavedDeliveryDetails(checkoutDetails);
        }, AnimationService.getAnimationDuration("smooth"));
    }

    // Go back to previous step
    function goBack() {
        isEntering = false;
        isExiting = true;

        // If leaving step 3, trigger zipper exit (EXACT SlideOutCart pattern)
        if (currentStep === 3 && checkoutContainer) {
            AnimationService.stopCartZipper(checkoutContainer);
        }

        // Switch step and enter after exit completes
        setTimeout(() => {
            currentStep--;
            isExiting = false;
            isEntering = true;

            // Save the new step
            checkoutDetails.currentStep = currentStep;
    setSavedDeliveryDetails(checkoutDetails);
        }, AnimationService.getAnimationDuration("smooth"));
    }

    // Handle back to cart with exit animations
    function handleBackToCart() {
        // Save current state before closing
        checkoutDetails.currentStep = currentStep;
setSavedDeliveryDetails(checkoutDetails);

        isEntering = false;
        isExiting = true;

        // If leaving step 3, trigger zipper exit (EXACT SlideOutCart pattern)
        if (currentStep === 3 && checkoutContainer) {
            AnimationService.stopCartZipper(checkoutContainer);
        }

        setTimeout(() => {
            onClose();
            // Reset animation states
            isEntering = true;
            isExiting = false;
        }, AnimationService.getAnimationDuration("smooth"));
    }

    // Place the order with smooth exit animations
    async function placeOrder() {
        if (!checkoutDetails.addressHash || !checkoutDetails.deliveryTime) {
            checkoutError = "Please complete all required information";
            return;
        }

        // Immediately trigger exit animations (smooth UX)
        isEntering = false;
        isExiting = true;

        // Trigger zipper exit animation when placing order from step 3
        if (currentStep === 3 && checkoutContainer) {
            AnimationService.stopCartZipper(checkoutContainer);
        }

        // Start Holochain operation in background (don't block animations)
checkoutCart(checkoutDetails)
            .then((result) => {
                if (result.success) {
                    console.log("Order placed successfully");
                    // Dispatch success event
                    dispatch("checkout-success", {
                        cartHash: encodeHashToBase64(result.data),
                        details: checkoutDetails,
                    });
                } else {
                    console.error("Checkout failed:", result.message);
                    // TODO: Show toast notification for error
                    // For now, log the error - cart is already closed
                }
            })
            .catch((error) => {
                console.error("Error during checkout:", error);
                // TODO: Show toast notification for error
                // For now, log the error - cart is already closed
            });

        // Close cart smoothly after exit animations complete
        setTimeout(() => {
            onClose();
            // Reset animation states for next time
            isEntering = true;
            isExiting = false;
        }, AnimationService.getAnimationDuration("smooth"));
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
                    {isEntering}
                    {isExiting}
                    on:placeOrder={placeOrder}
                    on:editAddress={() => goToStep(1)}
                    on:editTime={() => goToStep(2)}
                    on:containerBound={(e) => {
                        checkoutContainer = e.detail;
                    }}
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
