<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { decode } from "@msgpack/msgpack";

    export let direction: "left" | "right";
    export let disabled: boolean = false;
    export let currentRanges;
    export let identifier; // subcategory or productType name
    export let store;
    export let productCache;
    export let selectedCategory;
    export let selectedSubcategory;
    export let mainGridContainer;
    export let isProductType = false;

    const dispatch = createEventDispatcher();

    async function handleNavigation() {
        try {
            const currentCapacity = Math.floor(
                mainGridContainer.offsetWidth / 245,
            );
            const prefetchAmount = currentCapacity * 3;

            // Different logic for left vs right navigation
            if (direction === "left") {
                // Calculate new start position
                const newStart = Math.max(
                    0,
                    currentRanges[identifier]?.start - currentCapacity || 0,
                );

                // Generate unique key for this row's cache
                const rowKey = isProductType
                    ? `${selectedSubcategory}_${identifier}`
                    : `${identifier}`;

                // Check cache first
                const cachedData = productCache.getRowNavigationCache(
                    selectedCategory,
                    isProductType ? selectedSubcategory : identifier,
                    rowKey,
                );

                if (
                    cachedData &&
                    newStart >= cachedData.rangeStart &&
                    newStart + currentCapacity <= cachedData.rangeEnd
                ) {
                    // Extract data from cache
                    const offsetInCache = newStart - cachedData.rangeStart;
                    const productsToShow = cachedData.products.slice(
                        offsetInCache,
                        offsetInCache + currentCapacity,
                    );

                    // Tell parent to update display with cached data
                    dispatch("dataLoaded", {
                        newStart,
                        products: productsToShow,
                        total: cachedData.total,
                        identifier,
                    });

                    // Prefetch previous data if needed
                    if (
                        newStart < cachedData.rangeStart + currentCapacity &&
                        newStart > 0
                    ) {
                        setTimeout(() => {
                            const prefetchStart = Math.max(
                                0,
                                newStart - prefetchAmount,
                            );
                            store.service.client
                                .callZome({
                                    role_name: "grocery",
                                    zome_name: "products",
                                    fn_name: "get_products_by_category",
                                    payload: {
                                        category: selectedCategory,
                                        subcategory: isProductType
                                            ? selectedSubcategory
                                            : identifier,
                                        product_type: isProductType
                                            ? identifier
                                            : undefined,
                                        offset: prefetchStart,
                                        limit: prefetchAmount,
                                    },
                                })
                                .then((prevResponse) => {
                                    if (prevResponse.products.length) {
                                        const prevProducts =
                                            prevResponse.products.map(
                                                (record) => ({
                                                    ...decode(
                                                        record.entry.Present
                                                            .entry,
                                                    ),
                                                    hash: record.signed_action
                                                        .hashed.hash,
                                                }),
                                            );

                                        productCache.setRowNavigationCache(
                                            prevProducts,
                                            prevResponse.total,
                                            prefetchStart,
                                            selectedCategory,
                                            isProductType
                                                ? selectedSubcategory
                                                : identifier,
                                            rowKey,
                                        );
                                    }
                                });
                        }, 100);
                    }
                } else {
                    // Cache miss - fetch new data
                    const response = await store.service.client.callZome({
                        role_name: "grocery",
                        zome_name: "products",
                        fn_name: "get_products_by_category",
                        payload: {
                            category: selectedCategory,
                            subcategory: isProductType
                                ? selectedSubcategory
                                : identifier,
                            product_type: isProductType
                                ? identifier
                                : undefined,
                            offset: newStart,
                            limit: prefetchAmount,
                        },
                    });

                    const decodedProducts = response.products.map((record) => ({
                        ...decode(record.entry.Present.entry),
                        hash: record.signed_action.hashed.hash,
                    }));

                    // Update display with fetched data
                    dispatch("dataLoaded", {
                        newStart,
                        products: decodedProducts.slice(0, currentCapacity),
                        total: response.total,
                        identifier,
                    });

                    // Cache the full results
                    productCache.setRowNavigationCache(
                        decodedProducts,
                        response.total,
                        newStart,
                        selectedCategory,
                        isProductType ? selectedSubcategory : identifier,
                        rowKey,
                    );
                }
            } else {
                // Right navigation logic
                const newStart = currentRanges[identifier]?.end || 0;
                const rowKey = isProductType
                    ? `${selectedSubcategory}_${identifier}`
                    : `${identifier}`;

                const cachedData = productCache.getRowNavigationCache(
                    selectedCategory,
                    isProductType ? selectedSubcategory : identifier,
                    rowKey,
                );

                if (
                    cachedData &&
                    newStart >= cachedData.rangeStart &&
                    newStart + currentCapacity <= cachedData.rangeEnd
                ) {
                    // Use cached data
                    const offsetInCache = newStart - cachedData.rangeStart;
                    const productsToShow = cachedData.products.slice(
                        offsetInCache,
                        offsetInCache + currentCapacity,
                    );

                    dispatch("dataLoaded", {
                        newStart,
                        products: productsToShow,
                        total: cachedData.total,
                        identifier,
                    });

                    // Prefetch next batch if approaching end
                    if (
                        newStart + currentCapacity >
                        cachedData.rangeEnd - currentCapacity
                    ) {
                        setTimeout(() => {
                            store.service.client
                                .callZome({
                                    role_name: "grocery",
                                    zome_name: "products",
                                    fn_name: "get_products_by_category",
                                    payload: {
                                        category: selectedCategory,
                                        subcategory: isProductType
                                            ? selectedSubcategory
                                            : identifier,
                                        product_type: isProductType
                                            ? identifier
                                            : undefined,
                                        offset: cachedData.rangeEnd,
                                        limit: prefetchAmount,
                                    },
                                })
                                .then((nextResponse) => {
                                    if (nextResponse.products.length) {
                                        const nextProducts =
                                            nextResponse.products.map(
                                                (record) => ({
                                                    ...decode(
                                                        record.entry.Present
                                                            .entry,
                                                    ),
                                                    hash: record.signed_action
                                                        .hashed.hash,
                                                }),
                                            );

                                        productCache.setRowNavigationCache(
                                            nextProducts,
                                            nextResponse.total,
                                            cachedData.rangeEnd,
                                            selectedCategory,
                                            isProductType
                                                ? selectedSubcategory
                                                : identifier,
                                            rowKey,
                                        );
                                    }
                                });
                        }, 100);
                    }
                } else {
                    // Cache miss - fetch from backend
                    const response = await store.service.client.callZome({
                        role_name: "grocery",
                        zome_name: "products",
                        fn_name: "get_products_by_category",
                        payload: {
                            category: selectedCategory,
                            subcategory: isProductType
                                ? selectedSubcategory
                                : identifier,
                            product_type: isProductType
                                ? identifier
                                : undefined,
                            offset: newStart,
                            limit: prefetchAmount,
                        },
                    });

                    const decodedProducts = response.products.map((record) => ({
                        ...decode(record.entry.Present.entry),
                        hash: record.signed_action.hashed.hash,
                    }));

                    dispatch("dataLoaded", {
                        newStart,
                        products: decodedProducts.slice(0, currentCapacity),
                        total: response.total,
                        identifier,
                    });

                    productCache.setRowNavigationCache(
                        decodedProducts,
                        response.total,
                        newStart,
                        selectedCategory,
                        isProductType ? selectedSubcategory : identifier,
                        rowKey,
                    );
                }
            }
        } catch (error) {
            console.error("Navigation error:", error);
        }
    }
</script>

<button class="nav-arrow {direction}" {disabled} on:click={handleNavigation}>
    {direction === "left" ? "←" : "→"}
</button>

<style>
    .nav-arrow {
        position: absolute;
        top: 58%;
        transform: translateY(-50%);
        background: white;
        border: 1px solid rgb(32, 200, 51);
        border-radius: 50%;
        width: 50px;
        height: 50px;
        cursor: pointer;
        z-index: 10;
        font-size: 20px;
        font-weight: bold;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease-in-out;
    }

    .nav-arrow:hover {
        transform: translateY(-50%) scale(1.2);
        background-color: #1a8b51; /* Green background on hover */
        color: white; /* White arrow on hover */
    }

    .nav-arrow.left {
        left: -1px;
    }

    .nav-arrow.right {
        right: 5px;
    }

    .nav-arrow:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
