<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import AllProductsGrid from "./AllProductsGrid.svelte";
    import ProductRow from "./ProductRow.svelte";
    import type { ProductDataService } from "./ProductDataService";
    import { ProductRowCacheService } from "./ProductRowCacheService";
    import { tick } from "svelte";
    import { useResizeObserver } from "./useResizeObserver";
    // UPDATED: Import category utilities
    import {
        getSubcategoryConfig,
        isGridOnlySubcategory,
        getFilteredProductTypes,
        hasProductTypes,
        getAllSubcategories,
    } from "./categoryUtils";

    // Required props
    export let selectedCategory: string | null = null;
    export let selectedSubcategory: string | null = null;
    export let selectedProductType: string = "All";
    export let searchMode: boolean = false;
    export let productDataService: ProductDataService;

    // New props for home view
    export let isHomeView: boolean = false;
    export let featuredSubcategories: Array<{
        category: string;
        subcategory: string | null;
    }> = [];

    const dispatch = createEventDispatcher();

    // State variables with proper types
    let categoryProducts: Record<string, any[]> = {};
    let allCategoryProducts: any[] = [];
    let gridContainer: Record<string, any> = {};
    let currentRanges: Record<string, { start: number; end: number }> = {};
    let totalProducts: Record<string, number> = {};
    let containerCapacity: number = 0;
    let rowCapacities: Record<string, number> = {};
    let mainGridContainer: HTMLElement;
    let allProductsTotal: number = 0;
    let hasMore: Record<string, boolean> = {};

    let loadedSubcategoriesSet = new Set<string>();
    let visibleGroups = new Set();

    // Add state tracking to prevent stale operations
    let currentNavigationState = {
        category: null as string | null,
        subcategory: null as string | null,
        productType: "All",
    };

    // UPDATED: Use the new resize observer composable
    const resizeObserver = useResizeObserver(
        ({ element, identifier }) => {
            if (identifier) {
                handleResize(identifier, element);
            }
        },
        {
            debounceMs: 250,
            attributeName: "data-subcategory",
        },
    );

    // UPDATED: Export the action from the composable
    export const action = resizeObserver.action;

    onMount(() => {
        // Initial load handled by consolidated reactive statement
    });

    onDestroy(() => {
        categoryProducts = {};
        allCategoryProducts = [];
        // UPDATED: Use composable cleanup
        resizeObserver.disconnect();
    });

    // CONSOLIDATED REACTIVE STATEMENT
    $: {
        if (searchMode) {
            resetState();
        } else {
            currentNavigationState = {
                category: selectedCategory,
                subcategory: selectedSubcategory,
                productType: selectedProductType,
            };

            if (isHomeView && featuredSubcategories.length > 0) {
                loadHomeView();
            } else if (selectedCategory && selectedSubcategory) {
                loadProductsForCategory();
            } else if (selectedCategory && !selectedSubcategory) {
                loadProductsForCategory();
            }
        }
    }

    function handleResize(identifier: string, container: HTMLElement) {
        const newCapacity = Math.max(
            1,
            Math.floor(container.offsetWidth / 245),
        );
        const oldCapacity = rowCapacities[identifier] || containerCapacity;

        if (newCapacity !== oldCapacity) {
            updateRowCapacity(identifier, newCapacity, oldCapacity);
        }
    }

    async function updateRowCapacity(
        identifier: string,
        newCapacity: number,
        oldCapacity: number,
    ) {
        rowCapacities[identifier] = newCapacity;
        rowCapacities = { ...rowCapacities };

        if (newCapacity > oldCapacity) {
            const currentEnd = currentRanges[identifier]?.end || 0;
            const currentStart = currentRanges[identifier]?.start || 0;
            const currentlyDisplayed = currentEnd - currentStart;

            if (currentlyDisplayed < newCapacity) {
                await fetchAdditionalProducts(
                    identifier,
                    currentStart,
                    newCapacity,
                );
            }
        } else if (newCapacity < oldCapacity) {
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
        let category = selectedCategory;
        let subcategory = selectedSubcategory;

        if (isHomeView && identifier.includes("_")) {
            const parts = identifier.split("_");
            category = parts[0];
            subcategory = parts[1];
        } else if (!isHomeView && !selectedSubcategory) {
            subcategory = identifier;
        }

        if (!category || !subcategory) return;

        try {
            const isInSubcategoryView = selectedCategory && selectedSubcategory;
            const isProductTypeRow =
                isInSubcategoryView &&
                getFilteredProductTypes(category, subcategory).includes(
                    identifier,
                );

            let result;
            if (isProductTypeRow) {
                result = await productDataService.loadProductTypeProducts(
                    category,
                    subcategory,
                    identifier,
                    true,
                    capacity,
                );
            } else {
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

        resetState();

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

        resetState();

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

        const BATCH_SIZE = 3;

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

            processHomeViewResults(batchResults, containerCapacity);
            await tick();
            await registerResizeObservers();
        }
    }

    async function loadProductsForProductType() {
        if (!selectedCategory || !selectedSubcategory || searchMode) return;

        if (
            currentNavigationState.category !== selectedCategory ||
            currentNavigationState.subcategory !== selectedSubcategory ||
            currentNavigationState.productType !== selectedProductType
        ) {
            return;
        }

        allCategoryProducts = [];

        try {
            if (selectedProductType !== "All") {
                const result = await productDataService.loadProductTypeProducts(
                    selectedCategory,
                    selectedSubcategory,
                    selectedProductType,
                    false,
                );

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

    async function loadMainCategoryView(capacity: number) {
        if (!selectedCategory) return;

        // FIXED: Get all subcategories for this category
        const subcategories = getAllSubcategories(selectedCategory);
        const initialSubcategories = subcategories.slice(0, 3);

        const initialResults = await Promise.all(
            initialSubcategories.map(async (sub) => {
                return await productDataService.loadSubcategoryProducts(
                    selectedCategory!,
                    sub.name,
                    capacity,
                );
            }),
        );
        processSubcategoryResults(initialResults, capacity);
        await tick();

        if (subcategories.length > 3) {
            await loadRemainingSubcategories(subcategories.slice(3), capacity);
        }

        await loadAllCategoryProducts();
    }

    async function loadRemainingSubcategories(
        remainingSubcategories: any[],
        capacity: number,
    ) {
        if (!selectedCategory) return;

        const BATCH_SIZE = 5;
        for (let i = 0; i < remainingSubcategories.length; i += BATCH_SIZE) {
            const currentBatch = remainingSubcategories.slice(
                i,
                i + BATCH_SIZE,
            );

            const batchResults = await Promise.all(
                currentBatch.map(async (sub: any) => {
                    return await productDataService.loadSubcategoryProducts(
                        selectedCategory!,
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

    async function loadSubcategoryView(capacity: number) {
        if (!selectedCategory || !selectedSubcategory) return;

        // UPDATED: Use centralized utility
        const subcategoryConfig = getSubcategoryConfig(
            selectedCategory,
            selectedSubcategory,
        );
        if (!subcategoryConfig) {
            console.error(
                `Configuration not found for subcategory: ${selectedSubcategory}`,
            );
            return;
        }

        // UPDATED: Use centralized utility
        if (isGridOnlySubcategory(selectedCategory, selectedSubcategory)) {
            await loadGridOnlySubcategory();
        } else if (selectedProductType === "All") {
            await loadProductTypesView(capacity);
        } else {
            loadProductsForProductType();
        }
    }

    async function loadGridOnlySubcategory() {
        if (
            currentNavigationState.category !== selectedCategory ||
            currentNavigationState.subcategory !== selectedSubcategory
        ) {
            return;
        }

        if (!selectedCategory || !selectedSubcategory) return;

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

    async function loadProductTypesView(capacity: number) {
        if (!selectedCategory || !selectedSubcategory) return;

        // UPDATED: Use centralized utility
        const productTypes = getFilteredProductTypes(
            selectedCategory,
            selectedSubcategory,
        );

        const BATCH_SIZE = 5;
        for (let i = 0; i < productTypes.length; i += BATCH_SIZE) {
            const currentBatch = productTypes.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(
                currentBatch.map(async (type) => {
                    return await productDataService.loadProductTypeProducts(
                        selectedCategory!,
                        selectedSubcategory!,
                        type,
                        true,
                        capacity,
                    );
                }),
            );
            processProductTypeResults(batchResults, capacity);
            await tick();
            await registerResizeObservers();
        }
    }

    async function loadAllCategoryProducts() {
        if (currentNavigationState.subcategory !== null) {
            return;
        }

        if (!selectedCategory) return;

        const gridData =
            await productDataService.loadAllCategoryProducts(selectedCategory);

        if (
            currentNavigationState.category === selectedCategory &&
            currentNavigationState.subcategory === null
        ) {
            if (gridData?.products) {
                allCategoryProducts = gridData.products;
                allProductsTotal = gridData.total;
            } else {
                allCategoryProducts = [];
                allProductsTotal = 0;
            }
        }
    }

    async function registerResizeObservers() {
        await tick();
        const productRowNodes = document.querySelectorAll(".product-row-items");

        productRowNodes.forEach((node) => {
            const identifier = node.getAttribute("data-subcategory");
            if (identifier) {
                gridContainer[identifier] = node as HTMLElement;
                // UPDATED: Use composable instead of direct observer
                resizeObserver.observe(node as HTMLElement);
                loadedSubcategoriesSet.add(identifier);
            }
        });
    }

    function processSubcategoryResults(results: any[], capacity: number) {
        results.forEach((result: any) => {
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

    function processHomeViewResults(results: any[], capacity: number) {
        results.forEach((result: any) => {
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

    function processProductTypeResults(results: any[], capacity: number) {
        results.forEach((result: any) => {
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

        // UPDATED: Use composable cleanup
        resizeObserver.disconnect();
        gridContainer = {};
    }

    function handleDataLoaded(event: CustomEvent) {
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

        const capacity = rowCapacities[identifier] || containerCapacity;

        currentRanges[identifier] = {
            start: newStart,
            end: newStart + products.length,
        };

        if (
            totalProducts[identifier] === undefined &&
            typeof total === "number"
        ) {
            totalProducts[identifier] = total;
        }

        hasMore[identifier] = newHasMore;
        categoryProducts[identifier] = products;

        currentRanges = { ...currentRanges };
        totalProducts = { ...totalProducts };
        categoryProducts = { ...categoryProducts };
        hasMore = { ...hasMore };
    }

    function handleReportCategory(event: CustomEvent) {
        dispatch("reportCategory", event.detail);
    }

    function handleBoundariesInitialized(event: CustomEvent) {
        const { identifier: id, grandTotal } = event.detail;
        if (id && typeof grandTotal === "number") {
            if (totalProducts[id] !== grandTotal) {
                totalProducts[id] = grandTotal;
                totalProducts = { ...totalProducts };
            }
        }
    }

    function getSubcategoryFromIdentifier(identifier: string): string {
        if (!identifier.includes("_")) return identifier;
        const parts = identifier.split("_");
        return parts[1];
    }

    function getCategoryFromIdentifier(identifier: string): string | null {
        if (!identifier.includes("_")) return selectedCategory;
        const parts = identifier.split("_");
        return parts[0];
    }
</script>

<div class="product-browser" bind:this={mainGridContainer}>
    {#if isHomeView}
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
                    {productDataService}
                    selectedCategory={rowCategory || ""}
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
        <!-- FIXED: Use centralized utility to get ALL subcategories -->
        {#each getAllSubcategories(selectedCategory) as subcategory}
            {@const identifier = subcategory.name}
            {#if categoryProducts[identifier]}
                <ProductRow
                    title={identifier}
                    {identifier}
                    products={categoryProducts[identifier]}
                    {currentRanges}
                    {totalProducts}
                    {hasMore}
                    {productDataService}
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

        <AllProductsGrid
            {selectedCategory}
            selectedSubcategory={null}
            selectedProductType={"All"}
            products={allCategoryProducts}
            on:reportCategory={handleReportCategory}
            on:productTypeSelect
        />
    {:else if selectedCategory && selectedSubcategory}
        <!-- UPDATED: Use centralized utility functions -->
        {#if isGridOnlySubcategory(selectedCategory, selectedSubcategory) || selectedProductType !== "All"}
            <AllProductsGrid
                {selectedCategory}
                {selectedSubcategory}
                {selectedProductType}
                products={allCategoryProducts}
                on:reportCategory={handleReportCategory}
                on:productTypeSelect
            />
        {:else if selectedProductType === "All"}
            {#each getFilteredProductTypes(selectedCategory, selectedSubcategory) as productType}
                {@const identifier = productType}
                {#if categoryProducts[identifier]}
                    <ProductRow
                        title={identifier}
                        {identifier}
                        products={categoryProducts[identifier]}
                        {currentRanges}
                        {totalProducts}
                        {hasMore}
                        {productDataService}
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
