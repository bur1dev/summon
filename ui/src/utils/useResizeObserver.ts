import { tick } from 'svelte';

export interface ResizeCallbackData {
    element: HTMLElement;
    identifier?: string;
    entry: ResizeObserverEntry;
}

export interface ResizeObserverOptions {
    debounceMs?: number;
    attributeName?: string; // Attribute to extract identifier from
    requiresTick?: boolean; // Whether to await tick() before callback
}

/**
 * Reusable ResizeObserver composable with debouncing and cleanup
 */
export function useResizeObserver(
    callback: (data: ResizeCallbackData) => void | Promise<void>,
    options: ResizeObserverOptions = {}
) {
    const {
        debounceMs = 250,
        attributeName = 'data-subcategory',
        requiresTick = false
    } = options;

    let observer: ResizeObserver | null = null;
    let timeouts = new Map<Element, number>();

    const handleResize = async (entries: ResizeObserverEntry[]) => {
        for (const entry of entries) {
            const element = entry.target as HTMLElement;

            // Clear existing timeout for this element
            const existingTimeout = timeouts.get(element);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
            }

            // Set new debounced timeout
            const timeoutId = window.setTimeout(async () => {
                if (requiresTick) {
                    await tick();
                }

                const identifier = attributeName ? element.getAttribute(attributeName) : undefined;

                await callback({
                    element,
                    identifier: identifier || undefined,
                    entry
                });

                timeouts.delete(element);
            }, debounceMs);

            timeouts.set(element, timeoutId);
        }
    };

    const createObserver = () => {
        if (!observer) {
            observer = new ResizeObserver(handleResize);
        }
        return observer;
    };

    const observe = (element: HTMLElement) => {
        if (!element) return;
        const obs = createObserver();
        obs.observe(element);
    };

    const unobserve = (element: HTMLElement) => {
        if (!element || !observer) return;

        // Clear any pending timeout for this element
        const timeout = timeouts.get(element);
        if (timeout) {
            clearTimeout(timeout);
            timeouts.delete(element);
        }

        observer.unobserve(element);
    };

    const disconnect = () => {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        // Clear all timeouts
        timeouts.forEach(timeout => clearTimeout(timeout));
        timeouts.clear();
    };

    // Svelte action for use:action directive
    const action = (element: HTMLElement) => {
        if (!element) return;

        observe(element);

        return {
            destroy() {
                unobserve(element);
            }
        };
    };

    return {
        observe,
        unobserve,
        disconnect,
        action
    };
}