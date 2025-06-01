import { writable } from 'svelte/store';
import { tick } from 'svelte';

interface VirtualGridConfig {
    items: any[];
    itemWidth: number;
    itemHeight: number;
    containerCapacity?: number;
}

interface VirtualGridState {
    visibleIndices: number[];
    totalHeight: number;
    columnsPerRow: number;
    positionCache: Map<number, { top: number; left: number }>;
}

export function useVirtualGrid(config: VirtualGridConfig) {
    // Internal state
    let gridContainer: HTMLElement | null = null;
    let parentScrollContainer: HTMLElement | null = null;

    // Grid calculations
    let gridWidth = 0;
    let columnsPerRow = 1;
    let totalHeight = 0;
    let positionCache = new Map<number, { top: number; left: number }>();

    // Virtualization state
    let renderLoopActive = false;
    let targetVisibleIndices: number[] = [];
    let renderFrameId: number | null = null;
    let lastRenderTime = 0;
    let prevIndicesString = "";

    // Zoom tracking
    let currentZoom = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    let zoomTimeout: ReturnType<typeof setTimeout> | undefined;

    let boundScrollHandler: (() => void) | null = null;

    // Reactive stores
    const visibleIndices = writable<number[]>([]);
    const totalHeightStore = writable<number>(0);
    const gridState = writable<VirtualGridState>({
        visibleIndices: [],
        totalHeight: 0,
        columnsPerRow: 1,
        positionCache: new Map()
    });

    // Calculate grid layout
    function recalculateGrid() {
        if (!gridContainer) return;

        setTimeout(async () => {
            if (!gridContainer) return;
            await tick();

            gridWidth = gridContainer.offsetWidth;
            columnsPerRow = Math.max(1, Math.floor(gridWidth / config.itemWidth));

            const rowCount = Math.ceil(config.items.length / columnsPerRow);
            totalHeight = rowCount * config.itemHeight;

            console.log(`Grid recalc: ${config.items.length} items, ${columnsPerRow} cols, ${rowCount} rows, ${totalHeight}px height`);

            // Update reactive stores
            totalHeightStore.set(totalHeight);

            calculateVisibleIndices();
            updatePositionCache();

            // Update reactive state
            gridState.update(state => ({
                ...state,
                totalHeight,
                columnsPerRow,
                positionCache: new Map(positionCache)
            }));
        }, 10);
    }

    // Pre-compute all item positions
    function updatePositionCache() {
        if (!columnsPerRow) return;
        positionCache.clear();

        const cardWidth = config.itemWidth;
        const totalContentWidth = columnsPerRow * cardWidth;
        const remainingSpace = gridWidth - totalContentWidth;
        const gapBetweenItems = columnsPerRow > 1 ? remainingSpace / (columnsPerRow - 1) : 0;

        for (let i = 0; i < config.items.length; i++) {
            const row = Math.floor(i / columnsPerRow);
            const col = i % columnsPerRow;
            const leftPosition = col * (cardWidth + gapBetweenItems);

            positionCache.set(i, {
                top: row * config.itemHeight,
                left: leftPosition,
            });
        }
    }

    // Calculate which items should be visible
    function calculateVisibleIndices() {
        if (!gridContainer || !parentScrollContainer || !columnsPerRow) return;

        const gridRect = gridContainer.getBoundingClientRect();
        const containerRect = parentScrollContainer.getBoundingClientRect();

        const relativeScrollTop = Math.max(
            0,
            parentScrollContainer.scrollTop -
            (gridRect.top - containerRect.top + parentScrollContainer.scrollTop),
        );

        const viewportHeight = parentScrollContainer.clientHeight;
        const startRow = Math.floor(relativeScrollTop / config.itemHeight);
        const visibleRows = Math.ceil(viewportHeight / config.itemHeight) + 4;
        const startIndex = Math.max(0, (startRow - 3) * columnsPerRow);
        const endIndex = Math.min(
            config.items.length,
            (startRow + visibleRows + 3) * columnsPerRow,
        );

        if (!positionCache.has(startIndex)) {
            updatePositionCache();
        }

        targetVisibleIndices = Array.from(
            { length: endIndex - startIndex },
            (_, i) => startIndex + i,
        );
    }

    // Handle scroll events
    function handleScroll() {
        if (!gridContainer || !parentScrollContainer || !columnsPerRow) return;

        const gridRect = gridContainer.getBoundingClientRect();
        const containerRect = parentScrollContainer.getBoundingClientRect();

        const relativeScrollTop = Math.max(
            0,
            parentScrollContainer.scrollTop -
            (gridRect.top - containerRect.top + parentScrollContainer.scrollTop),
        );

        const viewportHeight = parentScrollContainer.clientHeight;
        const startRow = Math.floor(relativeScrollTop / config.itemHeight);
        const visibleRows = Math.min(3, Math.ceil(viewportHeight / config.itemHeight));
        const startIndex = Math.max(0, (startRow - 3) * columnsPerRow);
        const endIndex = Math.min(
            config.items.length,
            (startRow + visibleRows + 3) * columnsPerRow,
        );

        targetVisibleIndices = Array.from(
            { length: endIndex - startIndex },
            (_, i) => startIndex + i,
        );
    }

    // Start the render loop
    function startRenderLoop() {
        if (renderLoopActive) return;
        renderLoopActive = true;

        function renderFrame() {
            const now = performance.now();
            if (now - lastRenderTime >= 16) {
                if (targetVisibleIndices.length > 0) {
                    const currentIndicesString = `${targetVisibleIndices[0]}-${targetVisibleIndices[targetVisibleIndices.length - 1]}`;

                    if (currentIndicesString !== prevIndicesString) {
                        prevIndicesString = currentIndicesString;
                    }

                    visibleIndices.set([...targetVisibleIndices]);
                }
                lastRenderTime = now;
            }
            renderFrameId = requestAnimationFrame(renderFrame);
        }

        renderFrameId = requestAnimationFrame(renderFrame);
    }

    // Check for zoom changes
    function checkZoom() {
        if (typeof window === "undefined") return false;

        const newZoom = window.devicePixelRatio;
        if (newZoom !== currentZoom) {
            currentZoom = newZoom;

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

    // Handle resize events
    function handleResize() {
        checkZoom();
        if (gridContainer) {
            gridWidth = gridContainer.offsetWidth;
            recalculateGrid();
        }
    }

    // Initialize the virtual grid
    function initialize(element: HTMLElement) {
        gridContainer = element;

        // Find the global scroll container
        parentScrollContainer = document.querySelector('.global-scroll-container') as HTMLElement;

        if (parentScrollContainer) {
            boundScrollHandler = handleScroll;
            parentScrollContainer.addEventListener('scroll', boundScrollHandler);
            parentScrollContainer.style.willChange = 'transform';

            // Force initial calculation after setup
            setTimeout(() => {
                recalculateGrid();
                handleScroll();
            }, 100);
        } else {
            console.error("Global scroll container not found in useVirtualGrid!");
        }

        window.addEventListener('resize', handleResize);
        window.addEventListener('mouseup', checkZoom);
        window.addEventListener('keyup', checkZoom);

        currentZoom = window.devicePixelRatio;

        // Initial setup
        setTimeout(() => {
            recalculateGrid();
            updatePositionCache();
            startRenderLoop();
        }, 50);

        return {
            destroy() {
                renderLoopActive = false;
                if (renderFrameId) cancelAnimationFrame(renderFrameId);
                if (zoomTimeout) clearTimeout(zoomTimeout);

                if (parentScrollContainer && boundScrollHandler) {
                    parentScrollContainer.removeEventListener('scroll', boundScrollHandler);
                }
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('mouseup', checkZoom);
                window.removeEventListener('keyup', checkZoom);
            }
        };
    }

    // Action for binding to grid element
    const action = (element: HTMLElement) => initialize(element);

    // Reactive recalculation when items change
    function updateItems(newItems: any[]) {
        config.items = newItems;
        console.log(`updateItems called with ${newItems.length} items`);
        if (gridContainer) {
            recalculateGrid();
        }
    }

    return {
        visibleIndices,
        totalHeight: totalHeightStore,
        gridState,
        action,
        updateItems,
        getPositionCache: () => positionCache
    };
}