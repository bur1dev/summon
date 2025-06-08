<script lang="ts">
    import { onDestroy, createEventDispatcher } from "svelte";
    import type { DataManager } from "../../services/DataManager";
    import { tick } from "svelte";
    import { useResizeObserver } from "../../shared/utils/useResizeObserver";
    import ProductBrowserView from "./ProductBrowserView.svelte";
    import {
        getSubcategoryConfig,
        isGridOnlySubcategory,
        getFilteredProductTypes,
        getAllSubcategories,
    } from "../utils/categoryUtils";

    // Import stores for direct reactive subscriptions
    import {
        selectedCategoryStore,
        selectedSubcategoryStore,
        selectedProductTypeStore,
        isHomeViewStore,
        searchModeStore,
    } from "../../stores/DataTriggerStore";

    // Import the BrowserNavigationService
    import { browserNavigationService } from "../../services/BrowserNavigationService";

    // Required props
    export let dataManager: DataManager;
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
        isHomeView: true,
        searchMode: false,
    };

    // Ultra-simple navigation ID to prevent race conditions
    let navigationId = 0;
    let navigationDebounceId: number | null = null;

    // Utility for container capacity calculation
    const calculateContainerCapacity = (container: HTMLElement) =>
        Math.max(1, Math.floor(container.offsetWidth / 245));

    // Utility for consistent product slicing
    const sliceProducts = (products: any[], capacity: number) =>
        products.length > capacity ? products.slice(0, capacity) : products;

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

    export const action = resizeObserver.action;

    // Reactive navigation handling - respond to store changes
    $: navigationState = {
        category: $selectedCategoryStore,
        subcategory: $selectedSubcategoryStore,
        productType: $selectedProductTypeStore,
        isHomeView: $isHomeViewStore,
        searchMode: $searchModeStore,
    };

    $: handleNavigationChange(navigationState);

    // Handle navigation state changes with debouncing
    function handleNavigationChange(newState: typeof navigationState) {
        // Fast navigation state comparison using key concatenation
        const newStateKey = `${newState.category}|${newState.subcategory}|${newState.productType}|${newState.isHomeView}|${newState.searchMode}`;
        const currentStateKey = `${currentNavigationState.category}|${currentNavigationState.subcategory}|${currentNavigationState.productType}|${currentNavigationState.isHomeView}|${currentNavigationState.searchMode}`;
        const hasChanged = newStateKey !== currentStateKey;

        if (hasChanged) {
            // Check if this is a major navigation change (category/home)
            const isMajorChange =
                newState.category !== currentNavigationState.category ||
                newState.isHomeView !== currentNavigationState.isHomeView ||
                newState.searchMode !== currentNavigationState.searchMode;

            // Clear previous debounce
            if (navigationDebounceId) {
                clearTimeout(navigationDebounceId);
            }

            // Only debounce minor changes (subcategory/productType within same category)
            const debounceMs = isMajorChange ? 0 : 10;

            navigationDebounceId = setTimeout(() => {
                currentNavigationState = newState;

                // Handle navigation
                if (newState.searchMode) {
                    resetState();
                } else if (
                    newState.isHomeView &&
                    featuredSubcategories.length > 0
                ) {
                    handleNavigation("home");
                } else if (newState.category && newState.subcategory) {
                    handleNavigation("subcategory");
                } else if (newState.category && !newState.subcategory) {
                    handleNavigation("category");
                } else {
                }

                navigationDebounceId = null;
            }, debounceMs);
        }
    }

    onDestroy(() => {
        categoryProducts = {};
        allCategoryProducts = [];
        resizeObserver.disconnect();

        // Clean up timeouts
        if (navigationDebounceId) {
            clearTimeout(navigationDebounceId);
        }
    });

    // Ultra-simple navigation with race condition protection
    async function handleNavigation(type: "home" | "category" | "subcategory") {
        const currentId = ++navigationId; // Increment and capture navigation ID

        // Pause grid systems during navigation
        resizeObserver.disconnect();

        // Wait for DOM to settle
        await tick();

        switch (type) {
            case "home":
                await loadHomeView(currentId);
                break;
            case "category":
            case "subcategory":
                await loadProductsForCategory(currentId);
                break;
        }

        // Only re-register observers if this navigation is still current
        if (currentId === navigationId) {
            await tick();
            setTimeout(async () => {
                await tick();
                await registerResizeObservers();
            }, 100);
        }
    }

    function handleResize(identifier: string, container: HTMLElement) {
        const newCapacity = calculateContainerCapacity(container);
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
        let category = currentNavigationState.category;
        let subcategory = currentNavigationState.subcategory;

        if (currentNavigationState.isHomeView && identifier.includes("_")) {
            const parts = identifier.split("_");
            category = parts[0];
            subcategory = parts[1];
        } else if (
            !currentNavigationState.isHomeView &&
            !currentNavigationState.subcategory
        ) {
            subcategory = identifier;
        }

        if (!category || !subcategory) return;

        try {
            const isInSubcategoryView =
                currentNavigationState.category &&
                currentNavigationState.subcategory;
            const isProductTypeRow =
                isInSubcategoryView &&
                getFilteredProductTypes(category, subcategory).includes(
                    identifier,
                );

            let result;
            if (isProductTypeRow) {
                result = await dataManager.loadProductTypeProducts(
                    category,
                    subcategory,
                    identifier,
                    true,
                    capacity,
                );
            } else {
                result = await dataManager.loadSubcategoryProducts(
                    category,
                    subcategory,
                    capacity,
                );
            }

            if (result?.products) {
                categoryProducts[identifier] = sliceProducts(
                    result.products,
                    capacity,
                );
                const productsCount = categoryProducts[identifier].length;
                currentRanges[identifier] = {
                    start: startIndex,
                    end: startIndex + productsCount,
                };

                hasMore[identifier] =
                    result.hasMore || result.products.length > capacity;

                // Single reactive trigger
                categoryProducts = categoryProducts;
                currentRanges = currentRanges;
                hasMore = hasMore;
            }
        } catch (error) {
            console.error(
                `Error fetching additional products for ${identifier}:`,
                error,
            );
        }
    }

    async function loadProductsForCategory(navId: number) {
        if (
            !currentNavigationState.category ||
            currentNavigationState.searchMode
        )
            return;

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

        containerCapacity = calculateContainerCapacity(mainGridContainer);

        if (
            currentNavigationState.category &&
            !currentNavigationState.subcategory
        ) {
            await loadMainCategoryView(containerCapacity, navId);
        } else if (
            currentNavigationState.category &&
            currentNavigationState.subcategory
        ) {
            await loadSubcategoryView(containerCapacity, navId);
        }
    }

    async function loadHomeView(navId: number) {
        if (currentNavigationState.searchMode) return;

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

        containerCapacity = calculateContainerCapacity(mainGridContainer);

        const BATCH_SIZE = 3;

        for (let i = 0; i < featuredSubcategories.length; i += BATCH_SIZE) {
            const currentBatch = featuredSubcategories.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(
                currentBatch
                    .map(async (featured) => {
                        const result =
                            await dataManager.loadSubcategoryProducts(
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

            // Only update if this navigation is still current
            if (navId === navigationId) {
                await processResults(
                    batchResults,
                    containerCapacity,
                    "homeView",
                );
                await tick();
            }
        }
    }

    async function loadProductsForProductType(navId: number) {
        if (
            !currentNavigationState.category ||
            !currentNavigationState.subcategory ||
            currentNavigationState.searchMode
        )
            return;

        allCategoryProducts = [];

        try {
            if (currentNavigationState.productType !== "All") {
                const result = await dataManager.loadProductTypeProducts(
                    currentNavigationState.category,
                    currentNavigationState.subcategory,
                    currentNavigationState.productType,
                    false,
                );

                // Only update if this navigation is still current
                if (navId === navigationId) {
                    if (result?.products) {
                        allCategoryProducts = result.products;
                        allProductsTotal = result.total;
                    } else {
                        allCategoryProducts = [];
                        allProductsTotal = 0;
                    }
                }
            } else {
                await loadProductsForCategory(navId);
            }
        } catch (error) {
            console.error(
                `API Error loading grid for product type ${currentNavigationState.productType}:`,
                error,
            );
            // Only update if this navigation is still current
            if (navId === navigationId) {
                allCategoryProducts = [];
                allProductsTotal = 0;
            }
        }
    }

    async function loadMainCategoryView(capacity: number, navId: number) {
        if (!currentNavigationState.category) return;

        const subcategories = getAllSubcategories(
            currentNavigationState.category,
        );
        const initialSubcategories = subcategories.slice(0, 3);

        const initialResults = await Promise.all(
            initialSubcategories.map(async (sub) => {
                return await dataManager.loadSubcategoryProducts(
                    currentNavigationState.category!,
                    sub.name,
                    capacity,
                );
            }),
        );

        // Only update if this navigation is still current
        if (navId === navigationId) {
            await processResults(initialResults, capacity, "subcategory");
            await tick();

            if (subcategories.length > 3) {
                await loadRemainingSubcategories(
                    subcategories.slice(3),
                    capacity,
                    navId,
                );
            }

            await loadAllCategoryProducts(navId);
        }
    }

    async function loadRemainingSubcategories(
        remainingSubcategories: any[],
        capacity: number,
        navId: number,
    ) {
        if (!currentNavigationState.category) return;

        const BATCH_SIZE = 5;
        for (let i = 0; i < remainingSubcategories.length; i += BATCH_SIZE) {
            const currentBatch = remainingSubcategories.slice(
                i,
                i + BATCH_SIZE,
            );

            const batchResults = await Promise.all(
                currentBatch.map(async (sub: any) => {
                    return await dataManager.loadSubcategoryProducts(
                        currentNavigationState.category!,
                        sub.name,
                        capacity,
                    );
                }),
            );

            // Only update if this navigation is still current
            if (navId === navigationId) {
                await processResults(batchResults, capacity, "subcategory");
                await tick();
            }
        }
    }

    async function loadSubcategoryView(capacity: number, navId: number) {
        if (
            !currentNavigationState.category ||
            !currentNavigationState.subcategory
        )
            return;

        const subcategoryConfig = getSubcategoryConfig(
            currentNavigationState.category,
            currentNavigationState.subcategory,
        );
        if (!subcategoryConfig) {
            console.error(
                `Configuration not found for subcategory: ${currentNavigationState.subcategory}`,
            );
            return;
        }

        if (
            isGridOnlySubcategory(
                currentNavigationState.category,
                currentNavigationState.subcategory,
            )
        ) {
            await loadGridOnlySubcategory(navId);
        } else if (currentNavigationState.productType === "All") {
            await loadProductTypesView(capacity, navId);
        } else {
            await loadProductsForProductType(navId);
        }
    }

    async function loadGridOnlySubcategory(navId: number) {
        if (
            !currentNavigationState.category ||
            !currentNavigationState.subcategory
        )
            return;

        const result = await dataManager.loadProductTypeProducts(
            currentNavigationState.category,
            currentNavigationState.subcategory,
            null,
            false,
        );

        // Only update if this navigation is still current
        if (navId === navigationId) {
            if (result?.products) {
                allCategoryProducts = result.products;
                allProductsTotal = result.total;
            } else {
                allCategoryProducts = [];
                allProductsTotal = 0;
            }
        }
    }

    async function loadProductTypesView(capacity: number, navId: number) {
        if (
            !currentNavigationState.category ||
            !currentNavigationState.subcategory
        )
            return;

        const productTypes = getFilteredProductTypes(
            currentNavigationState.category,
            currentNavigationState.subcategory,
        );

        const BATCH_SIZE = 5;
        for (let i = 0; i < productTypes.length; i += BATCH_SIZE) {
            const currentBatch = productTypes.slice(i, i + BATCH_SIZE);

            const batchResults = await Promise.all(
                currentBatch.map(async (type) => {
                    return await dataManager.loadProductTypeProducts(
                        currentNavigationState.category!,
                        currentNavigationState.subcategory!,
                        type,
                        true,
                        capacity,
                    );
                }),
            );

            // Only update if this navigation is still current
            if (navId === navigationId) {
                await processResults(batchResults, capacity, "productType");
                await tick();
            }
        }
    }

    async function loadAllCategoryProducts(navId: number) {
        if (currentNavigationState.subcategory !== null) {
            return;
        }

        if (!currentNavigationState.category) return;

        const gridData = await dataManager.loadAllCategoryProducts(
            currentNavigationState.category,
        );

        // Only update if this navigation is still current
        if (navId === navigationId) {
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
                resizeObserver.observe(node as HTMLElement);
                loadedSubcategoriesSet.add(identifier);
            }
        });
    }

    // Unified processing function for all result types
    async function processResults(
        results: any[],
        capacity: number,
        type: "subcategory" | "homeView" | "productType",
    ) {
        for (const result of results) {
            // Extract identifier based on type
            const identifier =
                type === "subcategory"
                    ? result.name
                    : type === "homeView"
                      ? result.identifier
                      : result.type;

            if (!result?.products?.length || !identifier) continue;

            const initialProducts = sliceProducts(result.products, capacity);
            currentRanges[identifier] = {
                start: 0,
                end: initialProducts.length,
            };
            categoryProducts[identifier] = initialProducts;
            hasMore[identifier] =
                result.hasMore || result.products.length > capacity;
            rowCapacities[identifier] = capacity;
            visibleGroups.add(identifier);

            // Calculate totals based on type
            if (type === "subcategory") {
                totalProducts[identifier] =
                    result.total || result.products?.length || 0;
            } else if (type === "homeView") {
                try {
                    const total = await dataManager.getTotalProductsForPath(
                        result.category,
                        result.subcategory,
                    );
                    totalProducts[identifier] = total;
                } catch (error) {
                    console.error(
                        `Error getting total for ${identifier}:`,
                        error,
                    );
                    totalProducts[identifier] = result.products?.length || 0;
                }
            } else if (
                type === "productType" &&
                currentNavigationState.category &&
                currentNavigationState.subcategory
            ) {
                try {
                    const total = await dataManager.getTotalProductsForPath(
                        currentNavigationState.category,
                        currentNavigationState.subcategory,
                        identifier,
                    );
                    totalProducts[identifier] = total;
                } catch (error) {
                    console.error(
                        `Error getting total for ${identifier}:`,
                        error,
                    );
                    totalProducts[identifier] = result.products?.length || 0;
                }
            }
        }

        // Single reactive trigger
        categoryProducts = categoryProducts;
        currentRanges = currentRanges;
        totalProducts = totalProducts;
        hasMore = hasMore;
        rowCapacities = rowCapacities;
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
                "ProductBrowserData: handleDataLoaded received event without an identifier!",
            );
            return;
        }

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

        // Single reactive trigger
        currentRanges = currentRanges;
        totalProducts = totalProducts;
        categoryProducts = categoryProducts;
        hasMore = hasMore;
    }

    function handleBoundariesInitialized(event: CustomEvent) {
        const { identifier: id, grandTotal } = event.detail;
        if (id && typeof grandTotal === "number") {
            if (totalProducts[id] !== grandTotal) {
                totalProducts[id] = grandTotal;
                totalProducts = totalProducts;
            }
        }
    }

    function handleReportCategory(event: CustomEvent) {
        dispatch("reportCategory", event.detail);
    }

    async function handleProductTypeSelect(event: CustomEvent) {
        const { productType, category, subcategory } = event.detail;
        await browserNavigationService.navigateToProductType(
            productType,
            category,
            subcategory,
        );
    }

    async function handleViewMore(event: CustomEvent) {
        const { category, subcategory } = event.detail;
        await browserNavigationService.navigateViewMore(category, subcategory);
    }

    // mainGridContainer is now passed as a prop to the view component
</script>

<ProductBrowserView
    isHomeView={currentNavigationState.isHomeView}
    selectedCategory={currentNavigationState.category}
    selectedSubcategory={currentNavigationState.subcategory}
    selectedProductType={currentNavigationState.productType}
    {categoryProducts}
    {allCategoryProducts}
    {currentRanges}
    {totalProducts}
    {hasMore}
    {dataManager}
    {containerCapacity}
    {rowCapacities}
    {action}
    {gridContainer}
    bind:mainGridContainer
    on:dataLoaded={handleDataLoaded}
    on:boundariesInitialized={handleBoundariesInitialized}
    on:reportCategory={handleReportCategory}
    on:productTypeSelect={handleProductTypeSelect}
    on:viewMore={handleViewMore}
/>
