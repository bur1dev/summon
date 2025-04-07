<script lang="ts">
    export let id: string;
    export let isCheckedOut: boolean = false;
    export let colorClass: string = "";
</script>

<div class="cart-item {isCheckedOut ? 'checked-out' : ''} {colorClass}" {id}>
    <slot />
</div>

<style>
    .cart-item {
        display: flex;
        padding: 15px 0;
        border-bottom: 1px solid #e0e0e0;
        position: relative;
    }

    .checked-out {
        background-color: #f0fffe;
    }
</style>
