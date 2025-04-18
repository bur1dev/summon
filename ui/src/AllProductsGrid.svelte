<script lang="ts">
    import { getContext, onMount, onDestroy } from "svelte";
    import ProductCard from "./ProductCard.svelte";
    import { createEventDispatcher } from "svelte";

    export let selectedCategory: string;
    export let selectedSubcategory: string | null = null;
    export let selectedProductType: string | null = null;
    export let products = [];
    export let allProductsTotal: number = 0;

    const { getStore } = getContext("store");
    const store = getStore();
    const cartStore = store.cartStore;
    const dispatch = createEventDispatcher();

    let productsGridRef;
    let parentScrollContainer;
    let containerHeight;
    let visibleIndices = [];
    let columnsPerRow = 1;
    let totalHeight = 0;
    let gridWidth = 0;
    let itemWidth = 245;

    let positionCache = new Map();
    let rowHeight = 420;

    // Add zoom tracking
    let currentZoom =
        typeof window !== "undefined" ? window.devicePixelRatio : 1;
    let zoomTimeout;

    let renderLoopActive = false;
    let targetVisibleIndices = [];
    let renderFrameId = null;
    let lastRenderTime = 0;

    function startRenderLoop() {
        if (renderLoopActive) return;
        renderLoopActive = true;

        function renderFrame() {
            const now = performance.now();
            if (now - lastRenderTime >= 16) {
                // REPLACE indices rather than accumulating
                if (targetVisibleIndices.length > 0) {
                    // Clear and replace with new indices only
                    visibleIndices = [...targetVisibleIndices];
                }
                lastRenderTime = now;
            }
            renderFrameId = requestAnimationFrame(renderFrame);
        }

        renderFrameId = requestAnimationFrame(renderFrame);
    }

    // Check if zoom level has changed
    function checkZoom() {
        if (typeof window === "undefined") return false;

        const newZoom = window.devicePixelRatio;
        if (newZoom !== currentZoom) {
            currentZoom = newZoom;

            // Debounce the recalculation
            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                positionCache.clear();
                recalculateGrid();
                updatePositionCache();
            }, 300);

            return true;
        }
        return false;
    }

    // Stop render loop when component is destroyed
    onDestroy(() => {
        renderLoopActive = false;
        if (renderFrameId) cancelAnimationFrame(renderFrameId);
        if (zoomTimeout) clearTimeout(zoomTimeout);

        // Remove zoom detection events
        window.removeEventListener("mouseup", checkZoom);
        window.removeEventListener("keyup", checkZoom);
    });

    // Calculate the columns per row and visible products
    function recalculateGrid() {
        if (!productsGridRef) return;

        // Get actual width of grid container
        gridWidth = productsGridRef.offsetWidth - 10;

        // Calculate how many items fit per row (floor to ensure no overflow)
        columnsPerRow = Math.floor(gridWidth / itemWidth);

        // Update container height based on how many rows we need
        const rowCount = Math.ceil(products.length / columnsPerRow);
        totalHeight = rowCount * 420;

        // No need for gap size calculation when using percentage widths in absolute positioning
        // We'll use the full width divided by columns for positioning

        calculateVisibleIndices();
    }

    // Pre-compute all positions once
    function updatePositionCache() {
        if (!columnsPerRow) return;
        positionCache.clear();

        // Pre-compute ALL positions instead of just visible ones
        for (let i = 0; i < products.length; i++) {
            const row = Math.floor(i / columnsPerRow);
            const col = i % columnsPerRow;
            positionCache.set(i, {
                top: row * rowHeight,
                left: col * (gridWidth / columnsPerRow),
            });
        }
    }

    function calculateVisibleIndices() {
        if (!productsGridRef || !parentScrollContainer || !columnsPerRow)
            return;

        const scrollTop = Math.max(
            0,
            parentScrollContainer.scrollTop - productsGridRef.offsetTop,
        );
        const viewportHeight = parentScrollContainer.clientHeight;
        const startRow = Math.floor(scrollTop / rowHeight);
        const visibleRows = Math.ceil(viewportHeight / rowHeight) + 4;
        const startIndex = Math.max(0, (startRow - 3) * columnsPerRow);
        const endIndex = Math.min(
            products.length,
            (startRow + visibleRows + 3) * columnsPerRow,
        );

        if (!positionCache.has(startIndex)) {
            updatePositionCache();
        }

        // Update targetVisibleIndices instead of visibleIndices
        targetVisibleIndices = Array.from(
            { length: endIndex - startIndex },
            (_, i) => startIndex + i,
        );
    }

    function handleScroll() {
        if (!productsGridRef || !parentScrollContainer || !columnsPerRow)
            return;

        const scrollTop = Math.max(
            0,
            parentScrollContainer.scrollTop - productsGridRef.offsetTop,
        );

        const viewportHeight = parentScrollContainer.clientHeight;
        const startRow = Math.floor(scrollTop / rowHeight);

        // Maximum 3 visible rows (plus buffer)
        const visibleRows = Math.min(3, Math.ceil(viewportHeight / rowHeight));

        // Limit buffer to 2 rows above and below
        const startIndex = Math.max(0, (startRow - 2) * columnsPerRow);
        const endIndex = Math.min(
            products.length,
            (startRow + visibleRows + 2) * columnsPerRow,
        );

        // Reset target indices completely each time
        targetVisibleIndices = Array.from(
            { length: endIndex - startIndex },
            (_, i) => startIndex + i,
        );
    }

    function handleResize() {
        // Check if zoom level changed
        checkZoom();

        if (productsGridRef) {
            gridWidth = productsGridRef.offsetWidth;
        }
        recalculateGrid();
    }

    $: gridId = selectedProductType
        ? `all-products-${selectedProductType}`
        : `all-products-${selectedCategory}`;

    $: title =
        selectedProductType !== "All"
            ? selectedProductType
            : selectedSubcategory || "All Products";

    // Recalculate grid layout when products change
    $: if (products.length && productsGridRef) {
        recalculateGrid();
    }

    onMount(() => {
        containerHeight = window.innerHeight - 200;
        parentScrollContainer = productsGridRef?.closest(".scroll-container");

        if (parentScrollContainer) {
            parentScrollContainer.addEventListener("scroll", handleScroll);
            parentScrollContainer.style.willChange = "transform";
        }

        window.addEventListener("resize", handleResize);

        // Add zoom detection events - only triggers on user actions
        window.addEventListener("mouseup", checkZoom);
        window.addEventListener("keyup", checkZoom);

        // Initialize current zoom
        currentZoom = window.devicePixelRatio;

        recalculateGrid();
        updatePositionCache();
        startRenderLoop(); // Start the decoupled render loop

        return () => {
            parentScrollContainer?.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("mouseup", checkZoom);
            window.removeEventListener("keyup", checkZoom);
            renderLoopActive = false; // Stop the render loop
            if (renderFrameId) cancelAnimationFrame(renderFrameId);
            if (zoomTimeout) clearTimeout(zoomTimeout);
        };
    });
</script>

<div class="all-products-grid" id={gridId}>
    {#if title}
        <h2 class="all-products-title">{title}</h2>
    {/if}
    <div class="products-grid" bind:this={productsGridRef}>
        {#if products.length > 0}
            <div class="grid-container" style="height: {totalHeight}px;">
                {#each visibleIndices as index (products[index]?.hash || index)}
                    {#if products[index]}
                        <div
                            class="product-container"
                            style="position: absolute; top: {positionCache.get(
                                index,
                            )?.top ||
                                Math.floor(index / columnsPerRow) *
                                    420}px; left: {positionCache.get(index)
                                ?.left ||
                                (index % columnsPerRow) *
                                    (gridWidth /
                                        columnsPerRow)}px; width: calc({100 /
                                columnsPerRow}%);"
                        >
                            <ProductCard
                                product={products[index]}
                                on:reportCategory={(event) =>
                                    dispatch("reportCategory", event.detail)}
                            />
                        </div>
                    {/if}
                {/each}
            </div>
        {:else}
            <div class="loading-message">No products found</div>
        {/if}
    </div>
</div>

<style>
    .all-products-grid {
        margin-top: 20px;
        width: 100%;
    }

    .all-products-title {
        font-size: 30px;
        font-weight: bold;
        text-align: left;
        margin-bottom: 20px;
        padding-left: 15px;
        color: #343538;
    }

    .products-grid {
        width: 100%;
        position: relative;
    }

    .grid-container {
        position: relative;
        width: 100%;
        overflow-x: hidden;
        transform: translateZ(0);
        will-change: transform;
        backface-visibility: hidden;
        contain: content;
        perspective: 1000px;
    }

    .product-container {
        height: 420px;
        padding: 0;
        transform: translateZ(0);
        will-change: transform;
        contain: layout size;
    }

    .loading-message {
        padding: 20px;
        text-align: center;
        width: 100%;
    }

    :global(*) {
        outline: none !important;
    }
</style>
