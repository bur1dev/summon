<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import { decode } from "@msgpack/msgpack";
    import { ProductRowCacheService } from "./ProductRowCacheService";

    export let direction: "left" | "right";
    export let disabled: boolean = false;
    export let currentRanges;
    export let totalProducts; // This is the estimated total for the path
    export let identifier; // subcategory or productType name
    export let store;
    export let selectedCategory;
    export let selectedSubcategory;
    export let mainGridContainer;
    export let isProductType = false;
    export let hasMore = true; // New prop for has_more from backend
    export let containerCapacity: number; // New prop for dynamic capacity

    const dispatch = createEventDispatcher();
    const PRODUCTS_PER_GROUP = 100; // From backend constant

    // Create product row cache service instance
    // Using a static instance to share across components
    if (!window.productRowCache) {
        window.productRowCache = new ProductRowCacheService();
    }
    const productRowCache = window.productRowCache;

    let groupBoundaries = [];
    let boundariesInitialized = false;

    // Reset boundaries when capacity changes
    $: if (containerCapacity) {
        boundariesInitialized = false;
    }

    // Parse compound identifiers like "Category_Subcategory" if needed
    function parseIdentifier(id) {
        if (id && typeof id === "string" && id.includes("_")) {
            const parts = id.split("_");
            return {
                category: parts[0],
                subcategory: parts[1],
                isCompound: true,
            };
        }
        return {
            category: selectedCategory,
            subcategory: isProductType ? selectedSubcategory : identifier,
            isCompound: false,
        };
    }

    async function fetchGroup(
        groupOffset: number,
        groupLimit: number = 1,
    ): Promise<{ products: any[]; totalInPath: number; hasMore: boolean }> {
        try {
            // Parse the identifier to get correct category and subcategory
            const parsed = parseIdentifier(identifier);

            console.log(
                `🔍 Fetching group data: offset=${groupOffset}, limit=${groupLimit}, category=${parsed.category}, identifier=${identifier}, isProductType=${isProductType}`,
            );

            const response = await store.service.client.callZome({
                role_name: "grocery",
                zome_name: "products",
                fn_name: "get_products_by_category",
                payload: {
                    category: parsed.category,
                    subcategory: isProductType
                        ? selectedSubcategory
                        : parsed.isCompound
                          ? parsed.subcategory
                          : identifier,
                    product_type: isProductType ? identifier : undefined,
                    offset: groupOffset,
                    limit: groupLimit,
                },
            });

            const products = extractProductsFromGroups(
                response.product_groups || [],
            );
            const totalInPath = response.total_products || 0;
            const hasMore = response.has_more ?? false;

            console.log(
                `✅ Fetched group data: ${products.length} products, totalInPath=${totalInPath}, hasMore=${hasMore}`,
            );
            return { products, totalInPath, hasMore };
        } catch (fetchError) {
            console.error(
                `Error fetching groups from offset ${groupOffset}, limit ${groupLimit}:`,
                fetchError,
            );
            return {
                products: [],
                totalInPath: totalProducts[identifier] || 0,
                hasMore: false,
            };
        }
    }

    async function initializeGroupBoundaries() {
        if (boundariesInitialized) return;

        // Parse the identifier to get correct category and subcategory
        const parsed = parseIdentifier(identifier);

        const response = await store.service.client.callZome({
            role_name: "grocery",
            zome_name: "products",
            fn_name: "get_all_group_counts_for_path",
            payload: {
                category: parsed.category,
                subcategory: isProductType
                    ? selectedSubcategory
                    : parsed.isCompound
                      ? parsed.subcategory
                      : identifier,
                product_type: isProductType ? identifier : undefined,
            },
        });

        let accumulatedCount = 0;
        groupBoundaries = response.map((count) => {
            const boundary = {
                start: accumulatedCount,
                end: accumulatedCount + count,
            };
            accumulatedCount += count;
            return boundary;
        });
        boundariesInitialized = true;
    }

    function extractProductsFromGroups(groupRecords: any[]): any[] {
        if (!groupRecords || groupRecords.length === 0) return [];
        let allProducts = [];
        for (const record of groupRecords) {
            try {
                const group = decode(record.entry.Present.entry);
                const groupHash = record.signed_action.hashed.hash;
                if (group.products && Array.isArray(group.products)) {
                    const productsWithHash = group.products.map(
                        (product, index) => ({
                            ...product,
                            hash: `${groupHash}_${index}`,
                        }),
                    );
                    allProducts = [...allProducts, ...productsWithHash];
                }
            } catch (error) {
                console.error("Error decoding product group:", error);
            }
        }
        return allProducts;
    }

    async function handleNavigation() {
        const navigationStartTime = performance.now();
        console.log(
            `\n🕒 Starting navigation (${direction}) for ${identifier}`,
        );

        if (!mainGridContainer) {
            console.error("Main grid container is not available.");
            return;
        }
        if (disabled) {
            console.log("Navigation disabled.");
            return;
        }

        let currentCapacity = containerCapacity;

        if (!currentCapacity || currentCapacity <= 0) {
            try {
                currentCapacity = Math.floor(
                    mainGridContainer.offsetWidth / 245,
                );
                if (currentCapacity <= 0) {
                    console.warn(
                        "Calculated container capacity is zero or negative. Defaulting to 1.",
                    );
                    currentCapacity = 1;
                }
            } catch (e) {
                console.error("Error calculating capacity:", e);
                return;
            }
        }

        // Ensure we have current ranges for this identifier
        if (!currentRanges[identifier]) {
            currentRanges[identifier] = { start: 0, end: 0 };
        }

        const currentStart = currentRanges[identifier]?.start || 0;
        const currentEnd = currentRanges[identifier]?.end || 0;

        let targetVirtualStart: number;

        if (direction === "left") {
            targetVirtualStart = Math.max(0, currentStart - currentCapacity);
        } else {
            targetVirtualStart = currentEnd;
        }

        const targetVirtualEnd = targetVirtualStart + currentCapacity;

        // Check if we have the data in cache first
        if (!productRowCache) {
            console.error("Product row cache is not initialized");
            return;
        }

        if (!productRowCache.getProductsInRange) {
            console.error(
                "Function getProductsInRange not found on cache service - did the implementation change?",
            );
            // Continue without caching rather than breaking navigation
        } else {
            // Parse the identifier for caching
            const parsed = parseIdentifier(identifier);

            const cachedData = productRowCache.getProductsInRange({
                category: parsed.category,
                identifier: isProductType
                    ? identifier
                    : parsed.isCompound
                      ? parsed.subcategory
                      : identifier,
                isProductType,
                startIndex: targetVirtualStart,
                capacity: currentCapacity,
            });

            if (cachedData) {
                console.log(
                    `Using cached data for ${identifier} at ${targetVirtualStart}-${targetVirtualEnd}`,
                );

                // We'll handle disabled state separately from hasMore
                // Just pass through the cached hasMore value unchanged
                dispatch("dataLoaded", {
                    newStart: targetVirtualStart,
                    products: cachedData.products,
                    total: cachedData.totalInPath,
                    identifier,
                    hasMore: cachedData.hasMore,
                });

                const navigationEndTime = performance.now();
                console.log(
                    `🏁 Total navigation time (cached): ${(navigationEndTime - navigationStartTime).toFixed(2)}ms`,
                );
                return;
            }
        }

        // Time the while loop (counting phase)
        const countingStartTime = performance.now();

        // Initialize boundaries if needed
        await initializeGroupBoundaries();

        // Find groups that contain our target range
        let startGroupIndex = 0;
        let endGroupIndex = 0;

        if (groupBoundaries.length === 0) {
            console.log("No group boundaries found. Using defaults.");

            // Default to first group only
            startGroupIndex = 0;
            endGroupIndex = 0;
        } else {
            for (let i = 0; i < groupBoundaries.length; i++) {
                if (
                    groupBoundaries[i].start <= targetVirtualStart &&
                    targetVirtualStart < groupBoundaries[i].end
                ) {
                    startGroupIndex = i;
                }
                if (
                    groupBoundaries[i].start < targetVirtualEnd &&
                    targetVirtualEnd <= groupBoundaries[i].end
                ) {
                    endGroupIndex = i;
                    break;
                }
                // If targetVirtualEnd exceeds all boundaries, use the last group
                if (
                    i === groupBoundaries.length - 1 &&
                    targetVirtualEnd > groupBoundaries[i].end
                ) {
                    endGroupIndex = i;
                }
            }

            // Ensure endGroupIndex is never less than startGroupIndex
            if (endGroupIndex < startGroupIndex) {
                endGroupIndex = startGroupIndex;
            }
        }

        console.log(
            `Using pre-calculated boundaries: Found groups ${startGroupIndex}-${endGroupIndex} instantly`,
        );

        const countingEndTime = performance.now();
        console.log(
            `⏱️ Counting phase took ${(countingEndTime - countingStartTime).toFixed(2)}ms (0 group fetch(es))`,
        );

        console.log(
            `Navigating ${direction}: Capacity=${currentCapacity}, CurrentRange=${currentStart}-${currentEnd}, TargetVirtualRange=${targetVirtualStart}-${targetVirtualEnd}, GroupsNeeded=${startGroupIndex}-${endGroupIndex}`,
        );

        try {
            dispatch("loading", { identifier, loading: true });

            // Calculate how many groups we need to fetch
            const groupLimit = endGroupIndex - startGroupIndex + 1;

            // Time the final fetch
            const finalFetchStartTime = performance.now();

            // Fetch all needed groups in one call
            const {
                products: accumulatedProducts,
                totalInPath,
                hasMore: newHasMore,
            } = await fetchGroup(startGroupIndex, groupLimit);

            const finalFetchEndTime = performance.now();
            console.log(
                `⏱️ Final group fetch took ${(finalFetchEndTime - finalFetchStartTime).toFixed(2)}ms`,
            );

            // Calculate the start index within the accumulated products array
            let sliceStartIndex = 0;

            if (
                groupBoundaries.length > 0 &&
                groupBoundaries[startGroupIndex]
            ) {
                sliceStartIndex = Math.max(
                    0,
                    targetVirtualStart - groupBoundaries[startGroupIndex].start,
                );
            }

            // Slice the exact number of products needed for display
            const productsToShow = accumulatedProducts.slice(
                sliceStartIndex,
                sliceStartIndex + currentCapacity,
            );

            console.log(
                `Fetched ${accumulatedProducts.length} products from groups ${startGroupIndex}-${endGroupIndex}. Slice starts at index ${sliceStartIndex}. Showing ${productsToShow.length} products.`,
            );

            // Check if there are more products remaining
            let hasMoreProducts = false;

            if (
                groupBoundaries.length > 0 &&
                groupBoundaries[groupBoundaries.length - 1]
            ) {
                hasMoreProducts =
                    targetVirtualEnd <
                    groupBoundaries[groupBoundaries.length - 1].end;
            } else {
                hasMoreProducts = accumulatedProducts.length > currentCapacity;
            }

            // Parse identifier for caching
            const parsed = parseIdentifier(identifier);

            // Cache the FULL group of products, not just the slice we're showing
            productRowCache.setCacheGroup(
                parsed.category,
                isProductType
                    ? identifier
                    : parsed.isCompound
                      ? parsed.subcategory
                      : identifier,
                isProductType,
                startGroupIndex,
                {
                    products: accumulatedProducts, // Store ALL products from the group
                    rangeStart:
                        groupBoundaries.length > 0 &&
                        groupBoundaries[startGroupIndex]
                            ? groupBoundaries[startGroupIndex].start
                            : 0,
                    rangeEnd:
                        groupBoundaries.length > 0 &&
                        groupBoundaries[startGroupIndex]
                            ? groupBoundaries[startGroupIndex].start +
                              accumulatedProducts.length
                            : accumulatedProducts.length,
                    totalInPath,
                    hasMore: newHasMore || hasMoreProducts,
                },
            );

            // Dispatch the successfully fetched and sliced data
            dispatch("dataLoaded", {
                newStart: targetVirtualStart,
                products: productsToShow,
                total: totalInPath,
                identifier,
                hasMore: newHasMore || hasMoreProducts, // Enable button if more groups OR more products remain
            });
        } catch (error) {
            console.error(
                `Navigation error during group fetching (${direction}):`,
                error,
            );
            dispatch("navigationError", { error: error.message, identifier });
        } finally {
            dispatch("loading", { identifier, loading: false });

            const navigationEndTime = performance.now();
            const totalNavigationTime = navigationEndTime - navigationStartTime;
            console.log(
                `🏁 Total navigation time: ${totalNavigationTime.toFixed(2)}ms`,
            );
            console.log(
                `📊 Summary: 0 counting fetches + 1 final fetch = 1 total backend calls\n`,
            );
        }
    }

    // Clear cache when component is mounted
    onMount(() => {
        // Only clear cache for this specific category/subcategory/productType
        if (selectedCategory) {
            console.log(
                `Initialized navigation for ${identifier} in ${selectedCategory}`,
            );
        }
    });

    // Override disabled logic for right arrow to use hasMore
    $: if (direction === "right") {
        // Right arrow is enabled if hasMore OR we're not at the end of known content
        const atEnd =
            currentRanges[identifier]?.end >= totalProducts[identifier];
        disabled = !hasMore && atEnd;
    } else if (direction === "left") {
        // Left arrow is disabled only at the beginning
        disabled = currentRanges[identifier]?.start === 0;
    }
</script>

<button class="nav-arrow {direction}" {disabled} on:click={handleNavigation}>
    {direction === "left" ? "←" : "→"}
</button>

<style>
    .nav-arrow {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: white;
        border: 1px solid rgb(199, 200, 205);
        border-radius: 50%;
        width: 50px;
        height: 50px;
        cursor: pointer;
        z-index: 10;
        font-size: 20px;
        font-weight: bold;
        box-shadow:
            0 2px 5px rgba(0, 0, 0, 0.2),
            0 0 3px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease-in-out;
    }

    .nav-arrow:hover {
        transform: translateY(-50%) scale(1.2);
        background-color: rgb(61, 61, 61); /* Green background on hover */
        color: white; /* White arrow on hover */
        border: none;
    }

    .nav-arrow.left {
        left: -1px;
    }

    .nav-arrow.right {
        right: 6px;
    }

    .nav-arrow:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
