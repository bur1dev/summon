<script lang="ts">
    import { v1 as uuidv1 } from "uuid";
    import StickyEditor from "../StickyEditor.svelte";
    import ProductCartItem from "./ProductCartItem.svelte";
    import NoteCartItem from "./NoteCartItem.svelte";
    import CartFooter from "./CartFooter.svelte";
    import { isNoteSticky } from "./CartUtils";
    import * as BoardCommands from "./BoardCommands";

    // Props
    export let group: any;
    export let board: any;
    export let UngroupedId: string;
    export let cartStore: any;
    export let store: any;
    export let sortStickies: any;
    export let isUpdating: boolean = false;
    export let onClose: () => void;

    // Event handlers
    export let editSticky;
    export let deleteSticky;
    export let updateSticky;
    export let newSticky: (group: string) => void;
    export let createSticky: (groupId: string, props: any) => Promise<void>;

    // State
    export let editingStickyId: string;
    export let creatingInGroup: string;

    // Functions
    const sorted = (itemIds) => {
        console.time("sorting");
        if (!board || !board.state()) return [];
        const result = itemIds
            .map((id) => board.state().stickies.find((s) => s.id === id))
            .filter(Boolean);
        console.timeEnd("sorting");
        return result;
    };

    function calculateGroupTotal(stickyIds) {
        if (!board || !board.state()) return 0;
        return cartStore.calculateGroupTotal(stickyIds, board.state().stickies);
    }

    const addSticky = (group: string, props: any) => {
        if (group === undefined) {
            group = "0";
        }
        const sticky = {
            id: uuidv1(),
            props,
        };
        board.requestChanges([BoardCommands.addSticky(sticky, group)]);
    };

    const cancelEdit = () => {
        creatingInGroup = undefined;
        editingStickyId = null;
    };
</script>

<div class="cart-group" id={group.id}>
    <div class="cart-group-header">
        <div class="cart-title">
            Cart (Total: ${calculateGroupTotal(group.stickyIds).toFixed(2)})
        </div>

        {#if group.id.startsWith("cart_")}
            <button
                class="delete-cart-btn"
                on:click|stopPropagation={async () => {
                    try {
                        // First check if the board is valid
                        if (!board || !board.hash) {
                            console.log(
                                "Invalid board for deletion, resetting state",
                            );
                            cartStore.cartBoard = null;
                            cartStore.state.clearCart();
                            onClose();
                            return;
                        }

                        console.log(
                            "Archiving board with hash:",
                            board.hashB64,
                        );

                        // Use the board hash in base64 format if available
                        if (board.hashB64) {
                            // Reset cart reference first
                            cartStore.cartBoard = null;

                            // Then try to archive
                            try {
                                await store.boardList.archiveBoard(board.hash);
                            } catch (archiveError) {
                                console.warn(
                                    "Could not archive board:",
                                    archiveError,
                                );
                            }
                        }

                        // Clear cart state
                        cartStore.state.clearCart();
                        onClose();
                    } catch (error) {
                        console.error("Error deleting cart:", error);
                    }
                }}>×</button
            >
        {/if}
    </div>

    <div class="cart-items">
        {#each board && board.state() ? sorted(group.stickyIds, sortStickies) : [] as { id, props } (id)}
            {#if editingStickyId === id}
                <StickyEditor
                    handleSave={updateSticky}
                    handleDelete={() => deleteSticky(id)}
                    {cancelEdit}
                    groupId={group.id}
                    {props}
                />
            {:else if isNoteSticky(props.text)}
                <NoteCartItem {id} {props} {editSticky} {deleteSticky} />
            {:else}
                <ProductCartItem
                    {id}
                    {props}
                    {isUpdating}
                    {deleteSticky}
                    {cartStore}
                />
            {/if}
        {/each}

        {#if creatingInGroup !== undefined && creatingInGroup == group.id}
            <StickyEditor
                handleSave={createSticky}
                {cancelEdit}
                groupId={group.id}
                isCartNote={true}
            />
        {/if}
    </div>

    <CartFooter
        groupId={group.id}
        {UngroupedId}
        {newSticky}
        {cartStore}
        {onClose}
    />
</div>

<style>
    .cart-group {
        position: relative;
        border: none;
        margin: 0;
        padding: 0;
        background-color: #ffffff;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .cart-group-header {
        padding: 15px 20px;
        position: sticky;
        top: 0;
        background: #ffffff;
        z-index: 10;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e0e0e0;
    }

    .cart-title {
        font-size: 18px;
        font-weight: 600;
    }

    .delete-cart-btn {
        background: transparent;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        padding: 0 5px;
    }

    .cart-items {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 10px 20px;
        min-height: 0;
    }

    .glowing {
        outline: none;
        border-color: #9ecaed;
        box-shadow: 0 0 10px #9ecaed;
    }
</style>
