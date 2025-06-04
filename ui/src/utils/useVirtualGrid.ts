import { tick } from 'svelte';

interface VirtualGridConfig {
    items: any[];
    itemWidth: number;
    itemHeight: number;
    containerCapacity?: number;
}

interface VirtualGridCallbacks {
    onTotalHeightChange: (height: number) => void;
    onItemsChange: (items: any[]) => void;
}

export function useVirtualGrid(config: VirtualGridConfig, callbacks: VirtualGridCallbacks) {
    let items = config.items;
    const itemWidth = config.itemWidth;
    const itemHeight = config.itemHeight;

    let gridContainer: HTMLElement | null = null;
    let parentScrollContainer: HTMLElement | null = null;

    let gridWidth = 0;
    let columnsPerRow = 1;
    let totalHeight = 0;

    let productElements = new Map<number, HTMLElement>();
    let gridContainerElement: HTMLElement | null = null;

    let renderLoopActive = false;
    let currentVisibleIndices: number[] = [];
    let previousVisibleSet = new Set<number>();
    let renderFrameId: number | null = null;
    let lastRenderTime = 0;

    let currentZoom = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    let zoomTimeout: ReturnType<typeof setTimeout> | undefined;
    let boundScrollHandler: (() => void) | null = null;

    function updateItems(newItems: any[]) {
        items = newItems;
        previousVisibleSet.clear();
        callbacks.onItemsChange(newItems);

        if (gridContainer) {
            setTimeout(async () => {
                await tick();
                scanForElements();
                recalculateGrid();
            }, 50);
        }
    }

    function forceElementRescan() {
        if (!gridContainer) return;

        if (productElements.size !== items.length) {
            productElements.clear();
        }

        const elements = gridContainer.querySelectorAll('[data-virtual-index]');
        const elementArray = Array.from(elements) as HTMLElement[];

        elementArray.forEach((element, domIndex) => {
            element.setAttribute('data-virtual-index', domIndex.toString());
            productElements.set(domIndex, element);
        });
    }

    function recalculateGrid() {
        if (!gridContainer) return;

        setTimeout(async () => {
            if (!gridContainer) return;
            await tick();

            gridWidth = gridContainer.offsetWidth;
            columnsPerRow = Math.max(1, Math.floor(gridWidth / itemWidth));

            const rowCount = Math.ceil(items.length / columnsPerRow);
            totalHeight = rowCount * itemHeight;

            callbacks.onTotalHeightChange(totalHeight);
            calculateAndApplyPositions();
        }, 10);
    }

    function calculateAndApplyPositions() {
        if (!columnsPerRow || !gridContainer) return;
        const visibleIndices = calculateVisibleIndices();
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
        const bufferRows = 4;
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

        const currentVisibleSet = new Set(visibleIndices);

        const cardWidth = itemWidth;
        const totalContentWidth = columnsPerRow * cardWidth;
        const remainingSpace = gridWidth - totalContentWidth;
        const gapBetweenItems = columnsPerRow > 1 ? remainingSpace / (columnsPerRow - 1) : 0;

        // Batch all DOM updates
        requestAnimationFrame(() => {
            // Show new visible elements
            for (const index of visibleIndices) {
                if (index >= items.length) continue;

                const element = productElements.get(index);
                if (element && !previousVisibleSet.has(index)) {
                    const row = Math.floor(index / columnsPerRow);
                    const col = index % columnsPerRow;
                    const leftPosition = col * (cardWidth + gapBetweenItems);
                    const topPosition = row * itemHeight;

                    element.style.display = 'block';
                    element.style.transform = `translate3d(${leftPosition}px, ${topPosition}px, 0)`;
                }
            }

            // Hide elements that are no longer visible
            for (const index of previousVisibleSet) {
                if (!currentVisibleSet.has(index)) {
                    const element = productElements.get(index);
                    if (element) element.style.display = 'none';
                }
            }

            previousVisibleSet = currentVisibleSet;
            currentVisibleIndices = visibleIndices;
        });
    }

    // SIMPLE: Fast array comparison
    function arraysChanged(newIndices: number[]): boolean {
        if (newIndices.length !== currentVisibleIndices.length) return true;
        for (let i = 0; i < newIndices.length; i++) {
            if (newIndices[i] !== currentVisibleIndices[i]) return true;
        }
        return false;
    }

    let scrollTimeout: number | null = null;

    function handleScroll() {
        if (!gridContainer || !parentScrollContainer || !columnsPerRow) return;

        // Throttle scroll updates
        if (scrollTimeout) return;

        scrollTimeout = window.setTimeout(() => {
            const visibleIndices = calculateVisibleIndices();

            if (arraysChanged(visibleIndices)) {
                applyPositionsToDOM(visibleIndices);
            }

            scrollTimeout = null;
        }, 16); // 60fps timing
    }

    function checkZoom() {
        if (typeof window === "undefined") return false;

        const newZoom = window.devicePixelRatio;
        if (newZoom !== currentZoom) {
            currentZoom = newZoom;

            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                productElements.clear();
                previousVisibleSet.clear();
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

            setTimeout(() => {
                recalculateGrid();
                forceElementRescan();
                handleScroll();
            }, 100);
        } else {
            console.error("Global scroll container not found!");
        }

        window.addEventListener('resize', handleResize);
        window.addEventListener('mouseup', checkZoom);
        window.addEventListener('keyup', checkZoom);

        currentZoom = window.devicePixelRatio;

        setTimeout(() => {
            recalculateGrid();
            forceElementRescan();
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
                previousVisibleSet.clear();
            }
        };
    }

    return {
        action: (element: HTMLElement) => initialize(element),
        updateItems,
        scanForElements,
        recalculateGrid,
        getCurrentTotalHeight: () => totalHeight
    };
}