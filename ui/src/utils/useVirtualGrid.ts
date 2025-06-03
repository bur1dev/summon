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
        console.log(`[VirtualGrid] updateItems called with ${newItems.length} items`);

        // Clear existing element references
        productElements.clear();

        // Notify component about business data change
        callbacks.onItemsChange(newItems);

        if (gridContainer) {
            recalculateGrid();
        }
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

            console.log(`[VirtualGrid] Grid recalc: ${items.length} items, ${columnsPerRow} cols, ${rowCount} rows, ${totalHeight}px height`);

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

            // Get or create element for this index
            let element = productElements.get(index);
            if (!element) {
                // Look for the element in the DOM
                element = gridContainer?.querySelector(`[data-virtual-index="${index}"]`) as HTMLElement;
                if (element) {
                    productElements.set(index, element);
                }
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
        console.log(`[VirtualGrid] Applied positions to ${visibleIndices.length} visible items`);
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
        console.log('[VirtualGrid] Starting render loop');

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
        // Scan for all product elements in the grid and cache them
        if (!gridContainer) return;

        const elements = gridContainer.querySelectorAll('[data-virtual-index]');
        elements.forEach((element) => {
            const index = parseInt(element.getAttribute('data-virtual-index') || '0');
            productElements.set(index, element as HTMLElement);
        });

        console.log(`[VirtualGrid] Scanned and cached ${productElements.size} product elements`);
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
                scanForElements();
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
            scanForElements();
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