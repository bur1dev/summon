<script lang="ts">
    import { getContext, onMount, onDestroy, tick } from "svelte";
    import type { StoreContext } from "./store"; // Corrected import path
    import ProductCard from "./ProductCard.svelte";
    import { createEventDispatcher } from "svelte";
    import SortFilterDropdown from "./SortFilterDropdown.svelte";
    import {
        sortByStore,
        selectedBrandsStore,
        selectedOrganicStore,
    } from "./UiStateStore";
    import { mainCategories } from "./categoryData";

    export let selectedCategory: string;
    export let selectedSubcategory: string | null = null;
    export let selectedProductType: string | null = null;
    export let products = [];
    export let allProductsTotal: number = 0;

    const { getStore } = getContext<StoreContext>("store"); // Typed getContext
    const store = getStore();
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

    // ResizeObserver for scroll container
    let scrollContainerObserver: ResizeObserver;
    let resizeDebounceTimeout: number;

    // Sort and filter state
    let sortDropdownOpen = false;
    let brandsDropdownOpen = false;
    let organicDropdownOpen = false; // For the new dropdown

    // Determine if we should show sort/filter controls
    $: shouldShowControls = (() => {
        if (!selectedCategory || !selectedSubcategory) return false;

        // Check if this is a gridOnly subcategory
        const subcategoryConfig = mainCategories
            .find((c) => c.name === selectedCategory)
            ?.subcategories.find((s) => s.name === selectedSubcategory);

        const isGridOnly = subcategoryConfig?.gridOnly === true;
        const isProductTypeView =
            selectedProductType !== null && selectedProductType !== "All";

        return isGridOnly || isProductTypeView;
    })();

    // Extract unique brands from products
    $: availableBrands = (() => {
        const brands = new Set<string>();
        products.forEach((product) => {
            if (product.brand && product.brand.trim()) {
                brands.add(product.brand.trim());
            }
        });
        return Array.from(brands).sort();
    })();

    // Apply sorting and filtering to products
    $: sortedFilteredProducts = (() => {
        let result = [...products];

        // Apply brand filter
        if ($selectedBrandsStore.size > 0) {
            result = result.filter(
                (product) =>
                    product.brand &&
                    $selectedBrandsStore.has(product.brand.trim()),
            );
        }

        // Apply organic filter
        if ($selectedOrganicStore === "organic") {
            result = result.filter((product) => product.is_organic === true);
        } else if ($selectedOrganicStore === "non-organic") {
            result = result.filter(
                (product) =>
                    product.is_organic === false ||
                    product.is_organic === undefined,
            );
        }
        // 'all' does no organic filtering

        // Apply sorting
        if ($sortByStore === "price-asc") {
            result.sort((a, b) => (a.price || 0) - (b.price || 0));
        } else if ($sortByStore === "price-desc") {
            result.sort((a, b) => (b.price || 0) - (a.price || 0));
        }
        // 'best' uses original order

        return result;
    })();

    // Use sortedFilteredProducts instead of products for rendering
    $: virtualProducts = sortedFilteredProducts;

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
        if (scrollContainerObserver) scrollContainerObserver.disconnect();
        clearTimeout(resizeDebounceTimeout);

        // Remove zoom detection events
        window.removeEventListener("mouseup", checkZoom);
        window.removeEventListener("keyup", checkZoom);
    });

    // Calculate the columns per row and visible products
    async function recalculateGrid() {
        // Made async to potentially await tick
        if (!productsGridRef) return;

        // Delay calculation slightly to ensure DOM is fully rendered
        // This timeout might be less critical with ResizeObserver but can stay for now.
        setTimeout(async () => {
            // Check again if productsGridRef is still valid inside timeout
            if (!productsGridRef) return;

            await tick(); // Ensure Svelte DOM updates are flushed

            // Get actual width of grid container
            gridWidth = productsGridRef.offsetWidth;
            console.log(
                `Recalculating grid. productsGridRef.offsetWidth: ${gridWidth}`,
            );

            // Calculate how many items fit per row (floor to ensure no overflow)
            columnsPerRow = Math.max(1, Math.floor(gridWidth / itemWidth)); // Ensure at least 1 column

            // Update container height based on how many rows we need
            const rowCount = Math.ceil(virtualProducts.length / columnsPerRow);
            totalHeight = rowCount * rowHeight; // Use rowHeight variable

            calculateVisibleIndices();

            // Force update position cache after width calculation
            updatePositionCache();
        }, 10); // Keeping a small delay
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
        for (let i = 0; i < virtualProducts.length; i++) {
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
            virtualProducts.length,
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
        const startIndex = Math.max(0, (startRow - 3) * columnsPerRow);
        const endIndex = Math.min(
            virtualProducts.length,
            (startRow + visibleRows + 3) * columnsPerRow,
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
            recalculateGrid();
        }
    }

    $: gridId = selectedProductType
        ? `all-products-${selectedProductType}`
        : `all-products-${selectedCategory}`;

    $: title =
        selectedProductType !== "All"
            ? selectedProductType
            : selectedSubcategory || "All Products";

    // Recalculate grid layout when products change
    $: if (virtualProducts.length && productsGridRef) {
        recalculateGrid();
    }

    // Event handlers for dropdowns
    function handleSortChange(event) {
        sortByStore.set(event.detail);
        sortDropdownOpen = false;
    }

    function handleBrandsChange(event) {
        selectedBrandsStore.set(event.detail);
        brandsDropdownOpen = false;
    }

    function handleOrganicChange(event) {
        selectedOrganicStore.set(event.detail);
        organicDropdownOpen = false;
    }

    function handleSortOpen() {
        brandsDropdownOpen = false;
        organicDropdownOpen = false;
    }

    function handleBrandsOpen() {
        sortDropdownOpen = false;
        organicDropdownOpen = false;
    }

    function handleOrganicOpen() {
        sortDropdownOpen = false;
        brandsDropdownOpen = false;
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

            // Setup ResizeObserver for the scroll container
            scrollContainerObserver = new ResizeObserver((entries) => {
                clearTimeout(resizeDebounceTimeout);
                resizeDebounceTimeout = window.setTimeout(async () => {
                    console.log(
                        "AllProductsGrid: Global scroll container resized, recalculating grid...",
                    );
                    await tick(); // Ensure Svelte has processed DOM changes
                    recalculateGrid();
                }, 50); // Debounce for 50ms
            });
            scrollContainerObserver.observe(parentScrollContainer);

            // Force initial calculation
            setTimeout(() => {
                handleScroll(); // This will call calculateVisibleIndices
            }, 100); // Initial scroll/visibility check
        } else {
            console.error(
                "Global scroll container not found! ResizeObserver for scrollbar changes will not be active.",
            );
        }

        window.addEventListener("resize", handleResize); // Handles general window resize and zoom

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

            if (scrollContainerObserver) {
                scrollContainerObserver.disconnect();
            }
            clearTimeout(resizeDebounceTimeout);

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
            {#if shouldShowControls}
                <div class="sort-filter-controls">
                    <SortFilterDropdown
                        type="sort"
                        currentSort={$sortByStore}
                        bind:isOpen={sortDropdownOpen}
                        on:sortChange={handleSortChange}
                        on:open={handleSortOpen}
                    />
                    <SortFilterDropdown
                        type="brands"
                        selectedBrands={$selectedBrandsStore}
                        {availableBrands}
                        bind:isOpen={brandsDropdownOpen}
                        on:brandsChange={handleBrandsChange}
                        on:open={handleBrandsOpen}
                    />
                    <SortFilterDropdown
                        type="organic"
                        selectedOrganic={$selectedOrganicStore}
                        bind:isOpen={organicDropdownOpen}
                        on:organicChange={handleOrganicChange}
                        on:open={handleOrganicOpen}
                    />
                </div>
            {/if}
        </div>
    {/if}
    <div class="products-grid" bind:this={productsGridRef}>
        {#if virtualProducts.length > 0}
            <div class="grid-container" style="height: {totalHeight}px;">
                {#each visibleIndices as index (virtualProducts[index]?.hash || index)}
                    {#if virtualProducts[index]}
                        <div
                            class="product-container"
                            style="position: absolute; top: {positionCache.get(
                                index,
                            )?.top ??
                                Math.floor(index / columnsPerRow) *
                                    rowHeight}px; left: {positionCache.get(
                                index,
                            )?.left ?? 0}px; width: {itemWidth}px;"
                        >
                            <ProductCard
                                product={virtualProducts[index]}
                                on:reportCategory={(event) =>
                                    dispatch("reportCategory", event.detail)}
                                on:productTypeSelect
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
        align-items: center;
        width: 100%;
        margin-bottom: 20px;
        position: relative;
    }

    .sort-filter-controls {
        display: flex;
        gap: var(--spacing-sm);
        align-items: center;
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
        height: 100%; /* Occupy the full height of the space allocated by rowHeight logic */
        /* width is set inline: style="... width: {itemWidth}px;" */
        padding: 0;
        transform: translateZ(0);
        will-change: transform; /* Consider removing if not strictly needed for performance */
        /* contain: layout size; */ /* Can sometimes interfere with dynamic content or measurement */
        box-sizing: border-box;
        overflow: hidden; /* Prevent internal content from visually overflowing the card boundaries */
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
