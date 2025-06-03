import { tick } from 'svelte';

interface VirtualGridConfig {
    items: any[];
    itemWidth: number;
    itemHeight: number;
    containerCapacity?: number;
}

// Simplified callbacks - only notify about business data changes
interface VirtualGridCallbacks {
    onTotalHeightChange: (height: number) => void;
    onItemsChange: (items: any[]) => void;
}

export function useVirtualGrid(config: VirtualGridConfig, callbacks: VirtualGridCallbacks) {
    // === STATIC DATA (Stays reactive - changes rarely) ===
    let items = config.items;
    const itemWidth = config.itemWidth;
    const itemHeight = config.itemHeight;

    // === DYNAMIC DATA (Pure vanilla JS - no component updates) ===
    let gridContainer: HTMLElement | null = null;
    let parentScrollContainer: HTMLElement | null = null;

    // Grid calculations
    let gridWidth = 0;
    let columnsPerRow = 1;
    let totalHeight = 0;

    // DOM element tracking for direct manipulation
    let productElements = new Map<number, HTMLElement>();
    let gridContainerElement: HTMLElement | null = null;

    // Virtualization state
    let renderLoopActive = false;
    let currentVisibleIndices: number[] = [];
    let renderFrameId: number | null = null;
    let lastRenderTime = 0;

    // Zoom tracking
    let currentZoom = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    let zoomTimeout: ReturnType<typeof setTimeout> | undefined;

    let boundScrollHandler: (() => void) | null = null;

    // === STATIC DATA UPDATES (Business logic changes) ===
    function updateItems(newItems: any[]) {
        items = newItems;

        // Clear existing element references
        productElements.clear();

        // Notify component about business data change
        callbacks.onItemsChange(newItems);

        if (gridContainer) {
            // Force immediate element rescan after DOM updates
            setTimeout(async () => {
                await tick(); // Ensure DOM has updated
                forceElementRescan();
                recalculateGrid();
            }, 0);
        }
    }

    // === CORE FIX: Robust element scanning and indexing ===
    function forceElementRescan() {
        if (!gridContainer) return;

        productElements.clear();

        // Get all product elements and rebuild mapping based on current DOM order
        const elements = gridContainer.querySelectorAll('[data-virtual-index]');
        const elementArray = Array.from(elements) as HTMLElement[];

        // Update data-virtual-index attributes to match current array order
        elementArray.forEach((element, domIndex) => {
            element.setAttribute('data-virtual-index', domIndex.toString());
            productElements.set(domIndex, element);
        });
    }

    // === DIRECT DOM MANIPULATION (Performance-critical) ===
    function recalculateGrid() {
        if (!gridContainer) return;

        setTimeout(async () => {
            if (!gridContainer) return;
            await tick();

            gridWidth = gridContainer.offsetWidth;
            columnsPerRow = Math.max(1, Math.floor(gridWidth / itemWidth));

            const rowCount = Math.ceil(items.length / columnsPerRow);
            totalHeight = rowCount * itemHeight;

            // Notify component of height change for container sizing
            callbacks.onTotalHeightChange(totalHeight);

            calculateAndApplyPositions();
        }, 10);
    }

    function calculateAndApplyPositions() {
        if (!columnsPerRow || !gridContainer) return;

        // Calculate positions and which items should be visible
        const visibleIndices = calculateVisibleIndices();

        // Apply positioning directly to DOM elements
        applyPositionsToDOM(visibleIndices);
    }

    function calculateVisibleIndices(): number[] {
        if (!gridContainer || !parentScrollContainer || !columnsPerRow) return [];

        const gridRect = gridContainer.getBoundingClientRect();
        const containerRect = parentScrollContainer.getBoundingClientRect();

        const relativeScrollTop = Math.max(
            0,
            parentScrollContainer.scrollTop -
            (gridRect.top - containerRect.top + parentScrollContainer.scrollTop),
        );

        const viewportHeight = parentScrollContainer.clientHeight;
        const startRow = Math.floor(relativeScrollTop / itemHeight);
        const visibleRows = Math.ceil(viewportHeight / itemHeight);
        const bufferRows = 4; // Only 2 rows buffer above and below
        const startIndex = Math.max(0, (startRow - bufferRows) * columnsPerRow);
        const endIndex = Math.min(
            items.length,
            (startRow + visibleRows + bufferRows) * columnsPerRow,
        );

        return Array.from(
            { length: endIndex - startIndex },
            (_, i) => startIndex + i
        );
    }

    function applyPositionsToDOM(visibleIndices: number[]) {
        if (!gridContainer || !columnsPerRow) return;

        // Calculate layout parameters
        const cardWidth = itemWidth;
        const totalContentWidth = columnsPerRow * cardWidth;
        const remainingSpace = gridWidth - totalContentWidth;
        const gapBetweenItems = columnsPerRow > 1 ? remainingSpace / (columnsPerRow - 1) : 0;

        // Hide all current elements first
        productElements.forEach((element, index) => {
            if (!visibleIndices.includes(index)) {
                element.style.display = 'none';
            }
        });

        // Show and position visible elements
        visibleIndices.forEach(index => {
            if (index >= items.length) return;

            // Get element from cache - if not found, rescan
            let element = productElements.get(index);
            if (!element) {
                // Element not in cache - force rescan
                forceElementRescan();
                element = productElements.get(index);
            }

            if (element) {
                // Calculate position
                const row = Math.floor(index / columnsPerRow);
                const col = index % columnsPerRow;
                const leftPosition = col * (cardWidth + gapBetweenItems);
                const topPosition = row * itemHeight;

                // Apply positioning using CSS transforms (most performant)
                element.style.display = 'block';
                element.style.position = 'absolute';
                element.style.transform = `translate3d(${leftPosition}px, ${topPosition}px, 0)`;
                element.style.width = `${cardWidth}px`;
                element.style.height = `${itemHeight}px`;
            }
        });

        currentVisibleIndices = visibleIndices;
    }

    function handleScroll() {
        if (!gridContainer || !parentScrollContainer || !columnsPerRow) return;

        const visibleIndices = calculateVisibleIndices();

        // Only update if indices changed significantly
        if (JSON.stringify(visibleIndices) !== JSON.stringify(currentVisibleIndices)) {
            applyPositionsToDOM(visibleIndices);
        }
    }

    // === PERFORMANCE-CRITICAL RENDER LOOP (Vanilla JS) ===
    function startRenderLoop() {
        if (renderLoopActive) return;
        renderLoopActive = true;

        function renderFrame() {
            const now = performance.now();
            if (now - lastRenderTime >= 16) { // ~60fps
                handleScroll();
                lastRenderTime = now;
            }
            renderFrameId = requestAnimationFrame(renderFrame);
        }

        renderFrameId = requestAnimationFrame(renderFrame);
    }

    function checkZoom() {
        if (typeof window === "undefined") return false;

        const newZoom = window.devicePixelRatio;
        if (newZoom !== currentZoom) {
            currentZoom = newZoom;

            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                productElements.clear();
                recalculateGrid();
            }, 300);

            return true;
        }
        return false;
    }

    function handleResize() {
        checkZoom();
        if (gridContainer) {
            gridWidth = gridContainer.offsetWidth;
            recalculateGrid();
        }
    }

    function scanForElements() {
        // Delegate to the more robust forceElementRescan
        forceElementRescan();
    }

    function initialize(element: HTMLElement) {
        gridContainer = element;
        gridContainerElement = element;

        parentScrollContainer = document.querySelector('.global-scroll-container') as HTMLElement;

        if (parentScrollContainer) {
            boundScrollHandler = handleScroll;
            parentScrollContainer.addEventListener('scroll', boundScrollHandler, { passive: true });
            parentScrollContainer.style.willChange = 'transform';

            console.log('[VirtualGrid] Initialized with scroll container');

            setTimeout(() => {
                recalculateGrid();
                forceElementRescan();
                handleScroll();
            }, 100);
        } else {
            console.error("Global scroll container not found in useVirtualGrid!");
        }

        window.addEventListener('resize', handleResize);
        window.addEventListener('mouseup', checkZoom);
        window.addEventListener('keyup', checkZoom);

        currentZoom = window.devicePixelRatio;

        setTimeout(() => {
            recalculateGrid();
            forceElementRescan();
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

                productElements.clear();
            }
        };
    }

    // === PUBLIC API ===
    return {
        // Action for binding to grid element
        action: (element: HTMLElement) => initialize(element),

        // Method to update static data (business logic)
        updateItems,

        // Method to manually trigger element scan (call after DOM updates)
        scanForElements,

        // Method to manually recalculate (call after major layout changes)
        recalculateGrid,

        // Method to get current total height (for immediate access)
        getCurrentTotalHeight: () => totalHeight
    };
}