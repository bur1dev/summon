<script lang="ts">
    export let id: string;
</script>

<div class="cart-item" {id}>
    <slot />
</div>

<style>
    .cart-item {
        display: flex;
        padding: 15px 0;
        border-bottom: 1px solid var(--border);
        position: relative;
        transition: var(--btn-transition);
    }
</style>
