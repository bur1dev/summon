<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import AllProductsGrid from "./AllProductsGrid.svelte";
    import ProductRow from "./ProductRow.svelte";
    import { mainCategories } from "./categoryData";
    import type { ProductDataService } from "./ProductDataService";
    import { tick } from "svelte";

    // Required props
    export let selectedCategory: string | null = null;
    export let selectedSubcategory: string | null = null;
    export let selectedProductType: string = "All";
    export let searchMode: boolean = false;
    export let productDataService: ProductDataService;
    export let store: any;

    // New props for home view
    export let isHomeView: boolean = false;
    export let featuredSubcategories: Array<{
        category: string;
        subcategory: string | null;
    }> = [];

    const dispatch = createEventDispatcher();

    // State variables
    let categoryProducts = {}; // Holds the *currently displayed* products for each row identifier
    let allCategoryProducts = []; // Holds all products for the grid view
    let gridContainer = {}; // References to row container elements for resize observer
    let currentRanges = {}; // Holds { start, end } virtual indices for each row identifier
    let totalProducts = {}; // Holds estimated total products for each row identifier
    let containerCapacity = 0; // Calculated capacity based on width
    let rowCapacities = {}; // Store capacity for each row
    let mainGridContainer; // Reference to the main browser container
    let allProductsTotal = 0; // Total products for the grid view
    let hasMore = {}; // Holds hasMore values for each row identifier

    let loadedSubcategoriesSet = new Set<string>(); // Tracks observed rows
    let visibleGroups = new Set(); // Tracks initially visible rows

    let resizeTimeouts: Record<string, number> = {}; // Store separate timeouts for each row
    let isResizing = false;

    // Set up resize observer for responsive grid layout
    let resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const identifier = entry.target.getAttribute("data-subcategory");
            if (identifier) {
                handleResize(identifier, entry.target as HTMLElement);
            }
        }
    });

    // Expose action for components to register with resize observer
    export const action = (node) => {
        if (!node) return;
        resizeObserver.observe(node);
        return {
            destroy() {
                resizeObserver.unobserve(node);
            },
        };
    };

    onMount(() => {
        if (isHomeView) {
            loadHomeView();
        } else if (selectedCategory) {
            loadProductsForCategory();
        }
    });

    onDestroy(() => {
        categoryProducts = {};
        allCategoryProducts = [];
        resizeObserver?.disconnect();
        // Clear all resize timeouts
        Object.values(resizeTimeouts).forEach((timeout) =>
            clearTimeout(timeout),
        );
    });

    // Watch for category/subcategory changes
    $: if (!isHomeView && (selectedCategory || selectedSubcategory)) {
        loadProductsForCategory();
    }

    // Watch for product type changes (specifically for grid view)
    $: if (
        !isHomeView &&
        selectedProductType &&
        selectedCategory &&
        selectedSubcategory
    ) {
        loadProductsForProductType();
    }

    // Watch for home view changes
    $: if (isHomeView && featuredSubcategories.length > 0) {
        loadHomeView();
    }

    function handleResize(identifier: string, container: HTMLElement) {
        const newCapacity = Math.max(
            1,
            Math.floor(container.offsetWidth / 245),
        );
        const oldCapacity = rowCapacities[identifier] || containerCapacity;

        if (newCapacity !== oldCapacity) {
            // Use separate timeout for each row
            if (resizeTimeouts[identifier]) {
                clearTimeout(resizeTimeouts[identifier]);
            }
            resizeTimeouts[identifier] = setTimeout(() => {
                updateRowCapacity(identifier, newCapacity, oldCapacity);
            }, 250);
        }
    }

    async function updateRowCapacity(
        identifier: string,
        newCapacity: number,
        oldCapacity: number,
    ) {
        rowCapacities[identifier] = newCapacity;
        rowCapacities = { ...rowCapacities };

        // If capacity increased, we might need to fetch more products
        if (newCapacity > oldCapacity) {
            const currentEnd = currentRanges[identifier]?.end || 0;
            const currentStart = currentRanges[identifier]?.start || 0;
            const currentlyDisplayed = currentEnd - currentStart;

            console.log(
                `${identifier}: currentlyDisplayed=${currentlyDisplayed}, newCapacity=${newCapacity}, hasMore=${hasMore[identifier]}`,
            );

            // Try to fetch more products even if hasMore is undefined or false
            // This handles cases where hasMore might not be set properly
            if (currentlyDisplayed < newCapacity) {
                // Fetch more products to fill the expanded space
                console.log(`Fetching additional products for ${identifier}`);
                await fetchAdditionalProducts(
                    identifier,
                    currentStart,
                    newCapacity,
                );
            }
        } else if (newCapacity < oldCapacity) {
            // Capacity decreased, just slice the existing products
            const currentProducts = categoryProducts[identifier] || [];
            if (currentProducts.length > newCapacity) {
                const newProducts = currentProducts.slice(0, newCapacity);
                categoryProducts[identifier] = newProducts;
                categoryProducts = { ...categoryProducts };

                currentRanges[identifier] = {
                    start: currentRanges[identifier]?.start || 0,
                    end:
                        (currentRanges[identifier]?.start || 0) +
                        newProducts.length,
                };
                currentRanges = { ...currentRanges };
            }
        }
    }

    async function fetchAdditionalProducts(
        identifier: string,
        startIndex: number,
        capacity: number,
    ) {
        // For home view, parse the identifier to get category and subcategory
        let category = selectedCategory;
        let subcategory = selectedSubcategory;

        if (isHomeView && identifier.includes("_")) {
            const parts = identifier.split("_");
            category = parts[0];
            subcategory = parts[1];
            console.log(
                `Home view: Using category=${category}, subcategory=${subcategory}`,
            );
        } else if (!isHomeView && !selectedSubcategory) {
            // When in main category view, the identifier is the subcategory name
            subcategory = identifier;
            console.log(
                `Main category view: Using identifier "${identifier}" as subcategory`,
            );
        }

        try {
            // First check if we're in subcategory view with product type rows
            const isInSubcategoryView = selectedCategory && selectedSubcategory;

            // Check if this identifier is a product type for the current subcategory
            const isProductTypeRow =
                isInSubcategoryView &&
                (mainCategories
                    .find((c) => c.name === category)
                    ?.subcategories.find((s) => s.name === subcategory)
                    ?.productTypes?.includes(identifier) ??
                    false);

            let result;
            if (isProductTypeRow) {
                // This is a product type row - use the identifier as the product type
                console.log(
                    `Loading product type products for ${category}/${subcategory}/${identifier}`,
                );
                result = await productDataService.loadProductTypeProducts(
                    category,
                    subcategory,
                    identifier,
                    true,
                    capacity,
                );
            } else {
                // This is a subcategory row

                result = await productDataService.loadSubcategoryProducts(
                    category,
                    subcategory,
                    capacity,
                );
            }

            if (result?.products) {
                const productsToDisplay = result.products.slice(0, capacity);
                categoryProducts[identifier] = productsToDisplay;
                categoryProducts = { ...categoryProducts };

                currentRanges[identifier] = {
                    start: startIndex,
                    end: startIndex + productsToDisplay.length,
                };
                currentRanges = { ...currentRanges };

                hasMore[identifier] =
                    result.hasMore || result.products.length > capacity;
                hasMore = { ...hasMore };
            }
        } catch (error) {
            console.error(
                `Error fetching additional products for ${identifier}:`,
                error,
            );
        }
    }

    async function loadProductsForCategory() {
        if (!selectedCategory || searchMode) return;

        resetState(); // Clear previous state

        if (!mainGridContainer) {
            await tick();
            if (!mainGridContainer) {
                console.error(
                    "Main grid container not available for capacity calculation.",
                );
                return;
            }
        }

        containerCapacity = Math.max(
            1,
            Math.floor(mainGridContainer.offsetWidth / 245),
        );

        if (selectedCategory && !selectedSubcategory) {
            await loadMainCategoryView(containerCapacity);
        } else if (selectedCategory && selectedSubcategory) {
            await loadSubcategoryView(containerCapacity);
        }

        await registerResizeObservers();
    }

    async function loadHomeView() {
        if (searchMode) return;

        resetState(); // Clear previous state

        if (!mainGridContainer) {
            await tick();
            if (!mainGridContainer) {
                console.error(
                    "Main grid container not available for capacity calculation.",
                );
                return;
            }
        }

        containerCapacity = Math.max(
            1,
            Math.floor(mainGridContainer.offsetWidth / 245),
        );

        const BATCH_SIZE = 3; // Process 3 subcategories at a time

        for (let i = 0; i < featuredSubcategories.length; i += BATCH_SIZE) {
            const currentBatch = featuredSubcategories.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(
                currentBatch
                    .map(async (featured) => {
                        const result =
                            await productDataService.loadSubcategoryProducts(
                                featured.category,
                                featured.subcategory || featured.category,
                                containerCapacity,
                            );

                        if (result) {
                            // Create unique identifier for home view rows by combining category_subcategory
                            return {
                                ...result,
                                identifier: `${featured.category}_${featured.subcategory || featured.category}`,
                                category: featured.category,
                                subcategory:
                                    featured.subcategory || featured.category,
                            };
                        }
                        return null;
                    })
                    .filter(Boolean),
            );

            // Process results
            processHomeViewResults(batchResults, containerCapacity);
            await tick();
            await registerResizeObservers();
        }
    }

    async function loadProductsForProductType() {
        if (!selectedCategory || !selectedSubcategory || searchMode) return;
        allCategoryProducts = [];

        console.log(
            "Loading products for:",
            selectedCategory,
            selectedSubcategory,
            selectedProductType,
        );

        try {
            if (selectedProductType !== "All") {
                const result = await productDataService.loadProductTypeProducts(
                    selectedCategory,
                    selectedSubcategory,
                    selectedProductType,
                    false, // isPreview = false (fetch all for grid)
                );

                console.log("ProductDataService result:", result);

                if (result?.products) {
                    allCategoryProducts = result.products;
                    allProductsTotal = result.total;
                } else {
                    allCategoryProducts = [];
                    allProductsTotal = 0;
                }
            } else {
                loadProductsForCategory();
            }
        } catch (error) {
            console.error(
                `API Error loading grid for product type ${selectedProductType}:`,
                error,
            );
            allCategoryProducts = [];
            allProductsTotal = 0;
        }
    }

    async function loadMainCategoryView(capacity) {
        const subcategories =
            mainCategories.find((c) => c.name === selectedCategory)
                ?.subcategories || [];
        const initialSubcategories = subcategories.slice(0, 3);

        const initialResults = await Promise.all(
            initialSubcategories.map(async (sub) => {
                return await productDataService.loadSubcategoryProducts(
                    selectedCategory,
                    sub.name,
                    capacity,
                );
            }),
        );
        processSubcategoryResults(initialResults, capacity);
        await tick();

        if (subcategories.length > 3) {
            setTimeout(async () => {
                await loadRemainingSubcategories(
                    subcategories.slice(3),
                    capacity,
                );
            }, 100);
        }

        setTimeout(() => {
            loadAllCategoryProducts();
        }, 200);
    }

    async function loadRemainingSubcategories(
        remainingSubcategories,
        capacity,
    ) {
        const BATCH_SIZE = 5;
        for (let i = 0; i < remainingSubcategories.length; i += BATCH_SIZE) {
            const currentBatch = remainingSubcategories.slice(
                i,
                i + BATCH_SIZE,
            );

            const batchResults = await Promise.all(
                currentBatch.map(async (sub) => {
                    return await productDataService.loadSubcategoryProducts(
                        selectedCategory,
                        sub.name,
                        capacity,
                    );
                }),
            );
            processSubcategoryResults(batchResults, capacity);
            await tick();
            await registerResizeObservers();
        }
    }

    async function loadSubcategoryView(capacity) {
        const subcategoryConfig = mainCategories
            .find((c) => c.name === selectedCategory)
            ?.subcategories.find((s) => s.name === selectedSubcategory);
        if (!subcategoryConfig) {
            console.error(
                `Configuration not found for subcategory: ${selectedSubcategory}`,
            );
            return;
        }

        if (subcategoryConfig.gridOnly) {
            await loadGridOnlySubcategory();
        } else if (selectedProductType === "All") {
            await loadProductTypesView(capacity);
        } else {
            loadProductsForProductType();
        }
    }

    async function loadGridOnlySubcategory() {
        const result = await productDataService.loadProductTypeProducts(
            selectedCategory,
            selectedSubcategory,
            null,
            false,
        );
        if (result?.products) {
            allCategoryProducts = result.products;
            allProductsTotal = result.total;
        } else {
            allCategoryProducts = [];
            allProductsTotal = 0;
        }
    }

    async function loadProductTypesView(capacity) {
        const subcategoryConfig = mainCategories
            .find((c) => c.name === selectedCategory)
            ?.subcategories.find((s) => s.name === selectedSubcategory);
        if (!subcategoryConfig) return;
        const productTypes =
            subcategoryConfig.productTypes?.filter((t) => t !== "All") || [];

        const BATCH_SIZE = 5;
        for (let i = 0; i < productTypes.length; i += BATCH_SIZE) {
            const currentBatch = productTypes.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(
                currentBatch.map(async (type) => {
                    return await productDataService.loadProductTypeProducts(
                        selectedCategory,
                        selectedSubcategory,
                        type,
                        true, // isPreview = true
                        capacity, // Limit fetch
                    );
                }),
            );
            processProductTypeResults(batchResults, capacity);
            await tick();
            await registerResizeObservers();
        }
    }

    async function loadAllCategoryProducts() {
        const gridData =
            await productDataService.loadAllCategoryProducts(selectedCategory);
        if (gridData?.products) {
            allCategoryProducts = gridData.products;
            allProductsTotal = gridData.total;
        } else {
            allCategoryProducts = [];
            allProductsTotal = 0;
        }
    }

    async function registerResizeObservers() {
        await tick();
        const productRowNodes = document.querySelectorAll(".product-row-items");

        productRowNodes.forEach((node) => {
            const identifier = node.getAttribute("data-subcategory");
            if (identifier) {
                gridContainer[identifier] = node;
                // Always observe, even if already in set
                resizeObserver.observe(node);
                loadedSubcategoriesSet.add(identifier);
            } else {
                console.warn(
                    "Found .product-row-items without data-subcategory identifier.",
                );
            }
        });
    }

    function processSubcategoryResults(results, capacity) {
        results.forEach((result) => {
            if (!result?.products?.length || !result?.name) return;
            const identifier = result.name;
            const initialProducts = result.products.slice(0, capacity);
            currentRanges[identifier] = {
                start: 0,
                end: initialProducts.length,
            };
            categoryProducts[identifier] = initialProducts;
            hasMore[identifier] =
                result.hasMore || result.products.length > capacity;
            rowCapacities[identifier] = capacity;
            visibleGroups.add(identifier);
        });
        categoryProducts = { ...categoryProducts };
        currentRanges = { ...currentRanges };
        totalProducts = { ...totalProducts };
        hasMore = { ...hasMore };
        rowCapacities = { ...rowCapacities };
    }

    function processHomeViewResults(results, capacity) {
        results.forEach((result) => {
            if (!result?.products?.length || !result?.identifier) return;
            const identifier = result.identifier;
            const initialProducts = result.products.slice(0, capacity);
            currentRanges[identifier] = {
                start: 0,
                end: initialProducts.length,
            };
            categoryProducts[identifier] = initialProducts;
            hasMore[identifier] =
                result.hasMore || result.products.length > capacity;
            rowCapacities[identifier] = capacity;
            visibleGroups.add(identifier);
        });
        categoryProducts = { ...categoryProducts };
        currentRanges = { ...currentRanges };
        totalProducts = { ...totalProducts };
        hasMore = { ...hasMore };
        rowCapacities = { ...rowCapacities };
    }

    function processProductTypeResults(results, capacity) {
        results.forEach((result) => {
            if (!result?.products?.length || !result?.type) return;
            const identifier = result.type;
            const initialProducts = result.products.slice(0, capacity);
            currentRanges[identifier] = {
                start: 0,
                end: initialProducts.length,
            };
            categoryProducts[identifier] = initialProducts;
            hasMore[identifier] =
                result.hasMore || result.products.length > capacity;
            rowCapacities[identifier] = capacity;
            visibleGroups.add(identifier);
        });
        categoryProducts = { ...categoryProducts };
        currentRanges = { ...currentRanges };
        totalProducts = { ...totalProducts };
        hasMore = { ...hasMore };
        rowCapacities = { ...rowCapacities };
    }

    function resetState() {
        allCategoryProducts = [];
        currentRanges = {};
        categoryProducts = {};
        totalProducts = {};
        hasMore = {};
        rowCapacities = {};
        allProductsTotal = 0;
        visibleGroups.clear();
        loadedSubcategoriesSet.clear();

        // Clear all resize timeouts
        Object.values(resizeTimeouts).forEach((timeout) =>
            clearTimeout(timeout),
        );
        resizeTimeouts = {};

        resizeObserver?.disconnect();
        resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const identifier =
                    entry.target.getAttribute("data-subcategory");
                if (identifier) {
                    handleResize(identifier, entry.target as HTMLElement);
                }
            }
        });
        gridContainer = {};
    }

    // This function handles the 'dataLoaded' event from NavigationArrows
    function handleDataLoaded(event) {
        const {
            newStart,
            products,
            total,
            identifier,
            hasMore: newHasMore,
        } = event.detail;

        if (!identifier) {
            console.error(
                "ProductBrowser: handleDataLoaded received event without an identifier!",
            );
            return;
        }

        // Use row-specific capacity if available, otherwise use container capacity
        const capacity = rowCapacities[identifier] || containerCapacity;

        // Update the range based on the new virtual start and the number of products received
        currentRanges[identifier] = {
            start: newStart,
            end: newStart + products.length,
        };

        // totalProducts[identifier] is primarily set by handleBoundariesInitialized.
        // This ensures that if it wasn't set (e.g., for a very fast first load of a single product type
        // where dataLoaded might arrive before boundariesInitialized fully processed in parent),
        // it gets an initial value. 'total' from dataLoaded is NavigationArrows' current grand total prop.
        if (
            totalProducts[identifier] === undefined &&
            typeof total === "number"
        ) {
            totalProducts[identifier] = total;
        }

        // Update hasMore value
        hasMore[identifier] = newHasMore;

        // Update the products to be displayed in this specific row
        categoryProducts[identifier] = products;

        // Trigger reactivity for Svelte to update the UI
        currentRanges = { ...currentRanges };
        totalProducts = { ...totalProducts };
        categoryProducts = { ...categoryProducts };
        hasMore = { ...hasMore };
    }

    function handleReportCategory(event) {
        dispatch("reportCategory", event.detail);
    }

    function handleBoundariesInitialized(event) {
        const { identifier: id, grandTotal } = event.detail;
        if (id && typeof grandTotal === "number") {
            if (totalProducts[id] !== grandTotal) {
                console.log(
                    `ProductBrowser: Grand total for ${id} initialized/updated to ${grandTotal} by boundariesInitialized event.`,
                );
                totalProducts[id] = grandTotal;
                totalProducts = { ...totalProducts };
            }
        }
    }

    // Get subcategory name for display from identifier
    function getSubcategoryFromIdentifier(identifier) {
        if (!identifier.includes("_")) return identifier;
        const parts = identifier.split("_");
        return parts[1];
    }

    // Get category for a featured row
    function getCategoryFromIdentifier(identifier) {
        if (!identifier.includes("_")) return selectedCategory;
        const parts = identifier.split("_");
        return parts[0];
    }
</script>

<div class="product-browser" bind:this={mainGridContainer}>
    {#if isHomeView}
        <!-- Home View: Featured Subcategory Rows -->
        {#each Object.keys(categoryProducts) as identifier}
            {#if categoryProducts[identifier]?.length > 0}
                {@const rowCategory = getCategoryFromIdentifier(identifier)}
                {@const rowSubcategory =
                    getSubcategoryFromIdentifier(identifier)}
                <ProductRow
                    title={rowSubcategory}
                    {identifier}
                    products={categoryProducts[identifier]}
                    {currentRanges}
                    {totalProducts}
                    {hasMore}
                    {store}
                    selectedCategory={rowCategory}
                    selectedSubcategory={rowSubcategory}
                    {mainGridContainer}
                    containerCapacity={rowCapacities[identifier] ||
                        containerCapacity}
                    {action}
                    bind:this={gridContainer[identifier]}
                    onViewMore={() =>
                        dispatch("viewMore", {
                            category: rowCategory,
                            subcategory: rowSubcategory,
                        })}
                    on:dataLoaded={handleDataLoaded}
                    on:boundariesInitialized={handleBoundariesInitialized}
                    on:reportCategory={handleReportCategory}
                    on:productTypeSelect
                />
            {/if}
        {/each}
    {:else if selectedCategory && !selectedSubcategory}
        <!-- Main Category View: Rows for Subcategories -->
        {#each mainCategories.find((c) => c.name === selectedCategory)?.subcategories || [] as subcategory}
            {@const identifier = subcategory.name}
            <!-- Only render ProductRow if its data exists -->
            {#if categoryProducts[identifier]}
                <ProductRow
                    title={identifier}
                    {identifier}
                    products={categoryProducts[identifier]}
                    {currentRanges}
                    {totalProducts}
                    {hasMore}
                    {store}
                    {selectedCategory}
                    selectedSubcategory={identifier}
                    {mainGridContainer}
                    containerCapacity={rowCapacities[identifier] ||
                        containerCapacity}
                    {action}
                    bind:this={gridContainer[identifier]}
                    onViewMore={() =>
                        dispatch("viewMore", {
                            category: selectedCategory,
                            subcategory: identifier,
                        })}
                    on:dataLoaded={handleDataLoaded}
                    on:boundariesInitialized={handleBoundariesInitialized}
                    on:reportCategory={handleReportCategory}
                    on:productTypeSelect
                />
            {/if}
        {/each}

        <!-- "All Products" Grid at the bottom of Main Category View -->
        <AllProductsGrid
            {selectedCategory}
            selectedSubcategory={null}
            selectedProductType={"All"}
            products={allCategoryProducts}
            {allProductsTotal}
            on:reportCategory={handleReportCategory}
            on:productTypeSelect
        />
    {:else if selectedCategory && selectedSubcategory}
        <!-- Subcategory View -->
        {@const subcategoryConfig = mainCategories
            .find((c) => c.name === selectedCategory)
            ?.subcategories?.find((s) => s.name === selectedSubcategory)}

        {#if subcategoryConfig?.gridOnly || selectedProductType !== "All"}
            <!-- Grid View (for gridOnly subcats or specific product type selection) -->
            <AllProductsGrid
                {selectedCategory}
                {selectedSubcategory}
                {selectedProductType}
                products={allCategoryProducts}
                {allProductsTotal}
                on:reportCategory={handleReportCategory}
                on:productTypeSelect
            />
        {:else if selectedProductType === "All"}
            <!-- Row View (when subcategory selected and type is "All") -->
            {#each subcategoryConfig?.productTypes?.filter((pt) => pt !== "All") || [] as productType}
                {@const identifier = productType}
                <!-- Only render ProductRow if its data exists -->
                {#if categoryProducts[identifier]}
                    <ProductRow
                        title={identifier}
                        {identifier}
                        products={categoryProducts[identifier]}
                        {currentRanges}
                        {totalProducts}
                        {hasMore}
                        {store}
                        {selectedCategory}
                        {selectedSubcategory}
                        {mainGridContainer}
                        containerCapacity={rowCapacities[identifier] ||
                            containerCapacity}
                        {action}
                        bind:this={gridContainer[identifier]}
                        isProductType={true}
                        onViewMore={() =>
                            dispatch("productTypeSelect", {
                                productType: identifier,
                            })}
                        on:dataLoaded={handleDataLoaded}
                        on:boundariesInitialized={handleBoundariesInitialized}
                        on:reportCategory={handleReportCategory}
                        on:productTypeSelect
                    />
                {/if}
            {/each}
        {/if}
    {/if}
</div>

<style>
    .product-browser {
        display: flex;
        flex-direction: column;
        gap: var(--section-spacing);
        overflow: visible;
        background-color: white;
    }
</style>
