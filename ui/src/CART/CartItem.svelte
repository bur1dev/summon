<script lang="ts">
    export let id: string;
    export let colorClass: string = "";
</script>

<div class="cart-item {colorClass}" {id}>
    <slot />
</div>

<style>
    .cart-item {
        display: flex;
        padding: 15px 0;
        border-bottom: 1px solid #e0e0e0;
        position: relative;
    }
</style>
