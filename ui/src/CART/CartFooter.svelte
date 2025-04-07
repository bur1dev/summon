<script lang="ts">
    export let groupId: string;
    export let UngroupedId: string;
    export let newSticky: (group: string) => void;
    export let cartStore: any;
    export let onClose: () => void;
</script>

{#if groupId !== UngroupedId}
    <div class="add-note" on:click={() => newSticky(groupId)}>
        Add note for the Shopper
    </div>

    <div class="checkout-button-container">
        <button
            class="checkout-button"
            on:click={async () => {
                try {
                    console.log("Checking out cart:", groupId);

                    // Use CartStore's checkoutCart method
                    const result = await cartStore.checkoutCart();

                    if (result.success) {
                        // Close the cart slide-out
                        onClose();
                        console.log("Checked out cart successfully");
                    } else {
                        console.error("Checkout failed:", result.message);
                    }
                } catch (error) {
                    console.error("Error checking out cart:", error);
                }
            }}
        >
            Checkout all items
        </button>
    </div>
{/if}

<style>
    .add-note {
        padding: 15px 20px;
        border-top: 1px solid #e0e0e0;
        color: #0066c0;
        cursor: pointer;
        font-size: 14px;
        text-align: center;
    }

    .add-note:hover {
        background: #f5f5f5;
    }

    .checkout-button-container {
        padding: 20px;
        background: #ffffff;
        border-top: 1px solid #e0e0e0;
        margin-top: auto;
    }

    .checkout-button {
        width: 100%;
        padding: 14px;
        background: #1a8b51;
        border: 2px solid rgb(32, 200, 51);
        color: white;
        border-radius: 8px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        transition: background-color 0.2s;
    }

    .checkout-button:hover {
        background: #1a8b51;
        border: 2px solid rgb(32, 200, 51);
    }
</style>
