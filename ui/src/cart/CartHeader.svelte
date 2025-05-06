<script lang="ts">
    import { X } from "lucide-svelte";
    export let onClose: () => void;
</script>

<div class="cart-header">
    <button class="close-btn" on:click={onClose}>
        <X size={24} color="#343538" />
    </button>
    <h2>Shopping Cart</h2>
</div>

<style>
    .cart-header {
        padding: 20px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        align-items: center;
        position: relative;
    }

    .cart-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        flex-grow: 1;
        text-align: center;
    }

    .close-btn {
        position: absolute;
        left: 20px;
        background: transparent;
        border: none;
        cursor: pointer;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        transition: background-color 0.2s;
    }

    .close-btn:hover {
        background-color: #f5f5f5;
    }
</style>
