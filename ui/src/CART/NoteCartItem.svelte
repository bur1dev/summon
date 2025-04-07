<script lang="ts">
    import CartItem from "./CartItem.svelte";

    // Props
    export let id: string;
    export let props: any;

    // Event handlers
    export let editSticky;
    export let deleteSticky;
</script>

<CartItem
    {id}
    isCheckedOut={props.checked}
    colorClass={props.color || "skyblue"}
>
    <div class="note-icon">📝</div>

    <div class="cart-item-content">
        <div class="cart-item-top">
            <div class="cart-item-details" style="width: 100%;">
                <div class="note-title">Note for Shopper</div>
                <div class="note-text">{props.text}</div>
            </div>
        </div>

        <div class="cart-item-actions">
            <button
                class="edit-note"
                on:click|stopPropagation={() => editSticky(id)}
            >
                Edit
            </button>
            <button
                class="remove-item"
                on:click|stopPropagation={() => deleteSticky(id)}
            >
                Remove
            </button>
        </div>
    </div>
</CartItem>

<style>
    .note-icon {
        width: 40px;
        height: 40px;
        margin-right: 15px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
    }

    .note-title {
        font-weight: 500;
        font-size: 14px;
        color: #666;
        margin-bottom: 5px;
    }

    .note-text {
        font-size: 14px;
        line-height: 1.4;
        white-space: pre-wrap;
        padding: 8px;
        margin-bottom: 10px;
        max-height: 100px;
        overflow-y: auto;
    }

    .edit-note {
        background: transparent;
        border: none;
        color: #0066c0;
        cursor: pointer;
        font-size: 14px;
        padding: 5px 10px;
        text-decoration: underline;
        margin-right: 10px;
    }

    .edit-note:hover {
        color: #004080;
    }

    .cart-item-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }

    .cart-item-top {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
    }

    .cart-item-details {
        flex: 1;
    }

    .cart-item-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .remove-item {
        background: transparent;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        padding: 5px 10px;
        text-decoration: underline;
    }

    .remove-item:hover {
        color: #333;
    }

    /* Color classes */
    :global(.white) {
        background: linear-gradient(
            180deg,
            rgba(252, 250, 243, 1) 0%,
            #ffffff 100%
        );
    }

    :global(.yellow) {
        background: linear-gradient(180deg, #f9ffc4 0%, #f7f7ec 100%);
    }

    :global(.green) {
        background: linear-gradient(180deg, #d9fefa 0%, #f1f7ec 100%);
    }

    :global(.skyblue) {
        background: linear-gradient(180deg, #d0f2fe 0%, #ecf4f7 100%);
    }

    :global(.deepblue) {
        background: linear-gradient(180deg, #8dc9eb 0%, #ecf2f7 100%);
    }

    :global(.purple) {
        background: linear-gradient(180deg, #dcd1fd 0%, #f5ecf7 100%);
    }

    :global(.red) {
        background: linear-gradient(180deg, #ffd5e6 0%, #f7ecec 100%);
    }

    :global(.grey) {
        background: linear-gradient(180deg, #d2d2d2 0%, #ffffff 100%);
    }
</style>
