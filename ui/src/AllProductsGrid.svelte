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
    let rowHeight = 450;

    // Add zoom tracking
    let currentZoom =
        typeof window !== "undefined" ? window.devicePixelRatio : 1;
    let zoomTimeout;

    let renderLoopActive = false;
    let targetVisibleIndices = [];
    let renderFrameId = null;
    let lastRenderTime = 0;
    let prevIndicesString = "";

    function startRenderLoop() {
        if (renderLoopActive) return;
        renderLoopActive = true;

        function renderFrame() {
            const now = performance.now();
            if (now - lastRenderTime >= 16) {
                // Only log when indices actually change
                if (targetVisibleIndices.length > 0) {
                    const currentIndicesString = `${targetVisibleIndices[0]}-${targetVisibleIndices[targetVisibleIndices.length - 1]}`;

                    if (currentIndicesString !== prevIndicesString) {
                        console.log(
                            `Virtualization: Rendering ${targetVisibleIndices.length} items (indices ${currentIndicesString})`,
                        );
                        prevIndicesString = currentIndicesString;
                    }

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

        // Delay calculation slightly to ensure DOM is fully rendered
        setTimeout(() => {
            // Get actual width of grid container, but don't exceed parent width
            gridWidth = productsGridRef.offsetWidth;

            // Calculate how many items fit per row (floor to ensure no overflow)
            columnsPerRow = Math.floor(gridWidth / itemWidth);

            // Update container height based on how many rows we need
            const rowCount = Math.ceil(products.length / columnsPerRow);
            totalHeight = rowCount * 450;

            calculateVisibleIndices();

            // Force update position cache after width calculation
            updatePositionCache();
        }, 50);
    }

    // Pre-compute all positions once
    function updatePositionCache() {
        if (!columnsPerRow) return;
        positionCache.clear();

        // Fixed width for each card
        const cardWidth = 245;

        // Calculate total used width and remaining space
        const totalContentWidth = columnsPerRow * cardWidth;
        const remainingSpace = gridWidth - totalContentWidth;

        // Calculate gap between items (space-between logic)
        const gapBetweenItems =
            columnsPerRow > 1 ? remainingSpace / (columnsPerRow - 1) : 0;

        // Calculate position for each item
        for (let i = 0; i < products.length; i++) {
            const row = Math.floor(i / columnsPerRow);
            const col = i % columnsPerRow;

            // Position calculation: first item flush left, others with calculated gaps
            const leftPosition = col * (cardWidth + gapBetweenItems);

            positionCache.set(i, {
                top: row * rowHeight,
                left: leftPosition,
            });
        }
    }

    function calculateVisibleIndices() {
        if (!productsGridRef || !parentScrollContainer || !columnsPerRow)
            return;

        // Get the grid's position relative to the scroll container
        const gridRect = productsGridRef.getBoundingClientRect();
        const containerRect = parentScrollContainer.getBoundingClientRect();

        // Calculate the scroll position relative to the grid
        const relativeScrollTop = Math.max(
            0,
            parentScrollContainer.scrollTop -
                (gridRect.top -
                    containerRect.top +
                    parentScrollContainer.scrollTop),
        );

        const viewportHeight = parentScrollContainer.clientHeight;
        const startRow = Math.floor(relativeScrollTop / rowHeight);
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

        // Log virtualization stats
        console.log(
            `Virtualization: Rendering ${endIndex - startIndex} items (rows ${startRow} to ${startRow + visibleRows}) with buffer rows`,
        );
    }

    function handleScroll() {
        if (!productsGridRef || !parentScrollContainer || !columnsPerRow)
            return;

        // Get the grid's position relative to the scroll container
        const gridRect = productsGridRef.getBoundingClientRect();
        const containerRect = parentScrollContainer.getBoundingClientRect();

        // Calculate the scroll position relative to the grid
        const relativeScrollTop = Math.max(
            0,
            parentScrollContainer.scrollTop -
                (gridRect.top -
                    containerRect.top +
                    parentScrollContainer.scrollTop),
        );

        const viewportHeight = parentScrollContainer.clientHeight;
        const startRow = Math.floor(relativeScrollTop / rowHeight);

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

        // Find the global scroll container instead of closest .scroll-container
        parentScrollContainer = document.querySelector(
            ".global-scroll-container",
        );

        if (parentScrollContainer) {
            // Explicitly bind the context to handleScroll
            const boundScrollHandler = handleScroll.bind(this);
            parentScrollContainer.addEventListener(
                "scroll",
                boundScrollHandler,
            );
            parentScrollContainer.style.willChange = "transform";

            // Add immediate logging
            console.log(
                "Scroll handler attached to global container",
                parentScrollContainer,
            );

            // Force initial calculation
            setTimeout(() => {
                handleScroll();
                console.log("Initial scroll calculation forced");
            }, 100);
        } else {
            console.error("Global scroll container not found!");
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
        <div class="section-header">
            <div class="all-products-title">
                <b>{title}</b>
            </div>
        </div>
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
                                    450}px; left: {positionCache.get(index)
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
        padding-top: 20px;
        padding-bottom: 20px;
        width: 100%;
        box-sizing: border-box;
    }

    .all-products-title {
        font-size: 30px;
        font-weight: bold;
        text-align: left;
        margin-bottom: 0px;
        color: #343538;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        width: 100%;
        margin-bottom: 20px;
        position: relative;
    }

    .products-grid {
        width: 100%;
        position: relative;
        box-sizing: border-box; /* Add this */
        overflow: visible;
        max-width: 100%; /* Add this */
    }

    .grid-container {
        position: relative;
        width: 100%;
        overflow: visible;
        transform: translateZ(0);
        will-change: transform;
        backface-visibility: hidden;
        contain: layout size;
        perspective: 1000px;
        box-sizing: border-box; /* Add this */
        max-width: 100%; /* Add this */
    }

    .product-container {
        height: 450px;
        padding: 0;
        transform: translateZ(0);
        will-change: transform;
        contain: layout size;
        box-sizing: border-box; /* Add this */
        max-width: 100%; /* Add this */
    }

    .loading-message {
        padding: 20px;
        text-align: center;
        width: 100%;
        box-sizing: border-box;
    }

    :global(*) {
        outline: none !important;
    }
</style>
