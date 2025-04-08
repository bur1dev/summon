<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import AllProductsGrid from "./AllProductsGrid.svelte";
    import ProductRow from "./ProductRow.svelte";
    import { mainCategories } from "./categoryData";
    import type { ProductDataService } from "./ProductDataService";
    import type { ProductCacheStore } from "./ProductCacheStore";
    import { tick } from "svelte";

    // Required props
    export let selectedCategory: string | null = null;
    export let selectedSubcategory: string | null = null;
    export let selectedProductType: string = "All";
    export let searchMode: boolean = false;
    export let productDataService: ProductDataService;
    export let productCache: ProductCacheStore;
    export let store: any;

    const dispatch = createEventDispatcher();

    // State variables
    let categoryProducts = {};
    let allCategoryProducts = [];
    let gridContainer = {};
    let currentRanges = {};
    let totalProducts = {};
    let containerCapacity = 0;
    let mainGridContainer;
    let allProductsTotal = 0;

    let loadedSubcategoriesSet = new Set<string>();
    let visibleGroups = new Set();

    // Set up resize observer for responsive grid layout
    let resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            resizeCallback(entry.target);
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
        if (selectedCategory) {
            loadProductsForCategory();
        }
    });

    onDestroy(() => {
        categoryProducts = {};
        allCategoryProducts = [];
        resizeObserver?.disconnect();
    });

    // Watch for category/subcategory changes
    $: if (selectedCategory || selectedSubcategory) {
        loadProductsForCategory();
    }

    $: if (selectedProductType && selectedCategory && selectedSubcategory) {
        loadProductsForProductType();
    }

    // Resize callback for dynamic layout adjustments
    let resizeCallback = async (container) => {
        if (!selectedCategory || !currentRanges) return;

        const subcategoryName = container.getAttribute("data-subcategory");
        if (!subcategoryName) return;

        const width = container.offsetWidth;
        const itemWidth = 245;
        const capacity = Math.floor(width / itemWidth);

        if (!currentRanges[subcategoryName]) return;

        const currentStart = currentRanges[subcategoryName].start;
        const adjustedStart = Math.floor(currentStart / capacity) * capacity;

        const isProductType = mainCategories
            .find((c) => c.name === selectedCategory)
            ?.subcategories.find((s) => s.name === selectedSubcategory)
            ?.productTypes?.includes(subcategoryName);

        const result = await productDataService.loadProductsForNavigation(
            selectedCategory,
            isProductType ? selectedSubcategory : subcategoryName,
            isProductType ? subcategoryName : undefined,
            adjustedStart,
            capacity,
            isProductType,
        );

        if (result.products?.length > 0) {
            categoryProducts[subcategoryName] = result.products;
            currentRanges[subcategoryName] = {
                start: adjustedStart,
                end: adjustedStart + result.products.length,
            };
        }
    };

    async function loadProductsForCategory() {
        if (!selectedCategory || searchMode) return;

        resetState();

        if (!mainGridContainer) return;
        const containerCapacity = Math.floor(
            mainGridContainer.offsetWidth / 245,
        );

        if (selectedCategory && !selectedSubcategory) {
            await loadMainCategoryView(containerCapacity);
        } else if (selectedCategory && selectedSubcategory) {
            await loadSubcategoryView(containerCapacity);
        }

        await registerResizeObservers();
    }

    async function loadProductsForProductType() {
        if (!selectedCategory || !selectedSubcategory || searchMode) return;
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
                }
            } else {
                loadProductsForCategory();
            }
        } catch (error) {
            console.error("API Error:", error);
        }
    }

    async function loadMainCategoryView(containerCapacity) {
        const subcategories =
            mainCategories.find((c) => c.name === selectedCategory)
                ?.subcategories || [];

        // First batch: Load initial subcategories (visible at top)
        const initialSubcategories = subcategories.slice(0, 3);
        const initialResults = await Promise.all(
            initialSubcategories.map(async (sub) => {
                return await productDataService.loadSubcategoryProducts(
                    selectedCategory,
                    sub.name,
                    containerCapacity,
                );
            }),
        );

        // Process initial results
        processSubcategoryResults(initialResults);
        await tick();

        // Load remaining subcategories in background
        if (subcategories.length > 3) {
            setTimeout(async () => {
                await loadRemainingSubcategories(
                    subcategories.slice(3),
                    containerCapacity,
                );
            }, 100);
        }

        // Load All Products in background
        loadAllCategoryProducts();
    }

    async function loadRemainingSubcategories(
        remainingSubcategories,
        containerCapacity,
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
                        containerCapacity,
                    );
                }),
            );

            processSubcategoryResults(batchResults);

            // Update the UI after each batch
            categoryProducts = { ...categoryProducts };
            currentRanges = { ...currentRanges };

            await tick();
            await registerResizeObservers();
        }
    }

    async function loadSubcategoryView(containerCapacity) {
        const subcategoryConfig = mainCategories
            .find((c) => c.name === selectedCategory)
            ?.subcategories.find((s) => s.name === selectedSubcategory);

        if (!subcategoryConfig) return;

        if (subcategoryConfig.gridOnly) {
            await loadGridOnlySubcategory();
        } else if (selectedProductType === "All") {
            await loadProductTypesView(containerCapacity);
        }
    }

    async function loadGridOnlySubcategory() {
        // Load grid-only subcategories with progressive loading
        const initialResult = await productDataService.loadProductTypeProducts(
            selectedCategory,
            selectedSubcategory,
            null,
            false,
            50, // Limit to 50 for initial load
        );

        if (initialResult?.products) {
            // Display initial batch immediately
            allCategoryProducts = initialResult.products;
            allProductsTotal = initialResult.total;

            // Second phase: Load remaining products in background
            if (initialResult.total > 50) {
                setTimeout(async () => {
                    const remainingResult =
                        await productDataService.loadProductsForNavigation(
                            selectedCategory,
                            selectedSubcategory,
                            undefined,
                            50, // Starting from the 51st item
                            2000, // Large enough for all remaining
                            false,
                        );

                    if (remainingResult?.products?.length) {
                        // Add remaining products to display
                        allCategoryProducts = [
                            ...allCategoryProducts,
                            ...remainingResult.products,
                        ];

                        // Cache the full dataset
                        productCache.setCachedProducts(
                            allCategoryProducts,
                            allProductsTotal,
                            selectedCategory,
                            selectedSubcategory,
                            null,
                            false,
                        );
                    }
                }, 100);
            }
        }
    }

    async function loadProductTypesView(containerCapacity) {
        const subcategoryConfig = mainCategories
            .find((c) => c.name === selectedCategory)
            ?.subcategories.find((s) => s.name === selectedSubcategory);

        if (!subcategoryConfig) return;

        const productTypes =
            subcategoryConfig.productTypes?.filter((t) => t !== "All") || [];
        const BATCH_SIZE = 5;

        // Process product types in batches
        for (let i = 0; i < productTypes.length; i += BATCH_SIZE) {
            const currentBatch = productTypes.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(
                currentBatch.map(async (type) => {
                    return await productDataService.loadProductTypeProducts(
                        selectedCategory,
                        selectedSubcategory,
                        type,
                        true,
                        containerCapacity,
                    );
                }),
            );

            // Process results for this batch
            batchResults.forEach((result) => {
                if (!result?.products?.length || !result?.type) return;

                categoryProducts[result.type] = result.products;
                totalProducts[result.type] = result.total;
                if (!currentRanges[result.type]) {
                    currentRanges[result.type] = { start: 0, end: 0 };
                }
                currentRanges[result.type].end = result.products.length;
            });

            // Force UI update after each batch
            categoryProducts = { ...categoryProducts };
            await tick();
        }
    }

    async function loadAllCategoryProducts() {
        const gridData =
            await productDataService.loadAllCategoryProducts(selectedCategory);
        if (gridData?.products) {
            allCategoryProducts = gridData.products;
            allProductsTotal = gridData.total;
        }
    }

    async function registerResizeObservers() {
        const productRowNodes = document.querySelectorAll(".product-row-items");
        productRowNodes.forEach((node) => {
            const subcatName = node.getAttribute("data-subcategory");
            if (subcatName && !loadedSubcategoriesSet.has(subcatName)) {
                gridContainer[subcatName] = node;
                resizeObserver.observe(node);
            }
        });
    }

    function processSubcategoryResults(results) {
        results.forEach((result) => {
            if (!result?.products?.length || !result?.name) return;

            currentRanges[result.name] = {
                start: 0,
                end: result.products.length,
            };
            categoryProducts[result.name] = result.products;
            totalProducts[result.name] = result.total;
            loadedSubcategoriesSet.add(result.name);
            visibleGroups.add(result.name);
        });
    }

    function resetState() {
        allCategoryProducts = [];
        currentRanges = {};
        categoryProducts = {};
        allProductsTotal = 0;
        visibleGroups.clear();
        loadedSubcategoriesSet.clear();
    }

    function handleDataLoaded(event) {
        const { newStart, products, total, identifier } = event.detail;

        currentRanges[identifier] = {
            start: newStart,
            end: newStart + products.length,
        };
        currentRanges = { ...currentRanges };

        totalProducts[identifier] = total;
        categoryProducts[identifier] = products;
        categoryProducts = { ...categoryProducts };
    }

    function handleReportCategory(event) {
        dispatch("reportCategory", event.detail);
    }
</script>

<div class="product-browser" bind:this={mainGridContainer}>
    {#if selectedCategory && !selectedSubcategory}
        {#each mainCategories.find((c) => c.name === selectedCategory).subcategories as subcategory}
            <ProductRow
                title={subcategory.name}
                identifier={subcategory.name}
                products={categoryProducts[subcategory.name] || []}
                {currentRanges}
                {totalProducts}
                {store}
                {productCache}
                {selectedCategory}
                selectedSubcategory={subcategory.name}
                {mainGridContainer}
                {action}
                bind:this={gridContainer[subcategory.name]}
                onViewMore={() =>
                    dispatch("viewMore", {
                        category: selectedCategory,
                        subcategory: subcategory.name,
                    })}
                on:dataLoaded={handleDataLoaded}
                on:reportCategory={handleReportCategory}
            />
        {/each}

        <AllProductsGrid
            {selectedCategory}
            {selectedSubcategory}
            {selectedProductType}
            products={allCategoryProducts}
            {allProductsTotal}
            on:reportCategory={handleReportCategory}
        />
    {:else if selectedCategory && selectedSubcategory}
        {@const subcategoryConfig = mainCategories
            .find((c) => c.name === selectedCategory)
            ?.subcategories?.find((s) => s.name === selectedSubcategory)}
        {#if subcategoryConfig?.gridOnly || selectedProductType !== "All"}
            <AllProductsGrid
                {selectedCategory}
                {selectedSubcategory}
                {selectedProductType}
                products={allCategoryProducts}
                {allProductsTotal}
                on:reportCategory={handleReportCategory}
            />
        {:else if selectedProductType === "All"}
            {#each mainCategories
                .find((c) => c.name === selectedCategory)
                .subcategories.find((s) => s.name === selectedSubcategory)
                .productTypes.filter((pt) => pt !== "All") as productType}
                <ProductRow
                    title={productType}
                    identifier={productType}
                    products={categoryProducts[productType] || []}
                    {currentRanges}
                    {totalProducts}
                    {store}
                    {productCache}
                    {selectedCategory}
                    {selectedSubcategory}
                    {mainGridContainer}
                    {action}
                    bind:this={gridContainer[productType]}
                    isProductType={true}
                    onViewMore={() =>
                        dispatch("productTypeSelect", { productType })}
                    on:dataLoaded={handleDataLoaded}
                    on:reportCategory={handleReportCategory}
                />
            {/each}
        {/if}
    {/if}
</div>

<style>
    .product-browser {
        display: flex;
        flex-direction: column;
        gap: 30px;
        overflow: visible;
        padding: 0;
        width: 100%;
        background-color: white;
    }
</style>
