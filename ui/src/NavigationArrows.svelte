<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { ChevronsLeft, ChevronsRight } from "lucide-svelte";
    import type { ProductDataService } from "./ProductDataService";

    export let direction: "left" | "right";
    export let disabled: boolean = false;
    export let currentRanges;
    export let totalProducts;
    export let identifier;
    export let store;
    export let selectedCategory;
    export let selectedSubcategory;
    export let mainGridContainer;
    export let isProductType = false;
    export let hasMore = true;
    export let containerCapacity: number;
    export let productDataService: ProductDataService; // Injected service

    const dispatch = createEventDispatcher();
    let isNavigating = false;

    // Handle navigation
    async function handleNavigation() {
        if (!mainGridContainer || disabled || isNavigating) {
            return;
        }

        isNavigating = true;

        try {
            dispatch("loading", { identifier, loading: true });

            // Let the service handle all navigation logic
            const result = await productDataService.navigate(direction, {
                category: selectedCategory,
                identifier,
                isProductType,
                selectedSubcategory,
                currentRanges,
                totalProducts,
                containerCapacity,
            });

            // Emit the result
            dispatch("dataLoaded", result);

            // Check if boundaries were initialized for the first time
            if (!totalProducts[identifier] && result.total) {
                dispatch("boundariesInitialized", {
                    identifier: identifier,
                    grandTotal: result.total,
                });
            }
        } catch (error) {
            console.error(`Navigation error (${direction}):`, error);
            dispatch("navigationError", { error: error.message, identifier });
        } finally {
            dispatch("loading", { identifier, loading: false });
            isNavigating = false;
        }
    }

    // Override disabled logic for right arrow to use hasMore
    $: if (direction === "right") {
        const atEnd =
            currentRanges[identifier]?.end >= totalProducts[identifier];
        disabled = !hasMore && atEnd;
    } else if (direction === "left") {
        disabled = currentRanges[identifier]?.start === 0;
    }
</script>

<button
    class="nav-arrow-btn {direction} btn btn-icon {disabled ? 'disabled' : ''}"
    {disabled}
    on:click={handleNavigation}
>
    {#if direction === "left"}
        <ChevronsLeft size={24} />
    {:else}
        <ChevronsRight size={24} />
    {/if}
</button>

<style>
    .nav-arrow-btn.left {
        left: 0px;
    }

    .nav-arrow-btn.right {
        right: 0px;
    }
</style>
