import {
    selectedCategoryStore,
    selectedSubcategoryStore,
    selectedProductTypeStore,
    isHomeViewStore,
    sortByStore,
    selectedBrandsStore,
    selectedOrganicStore,
    searchModeStore
} from '../stores/DataTriggerStore';

export class BrowserNavigationService {
    private static instance: BrowserNavigationService | null = null;
    private navigationCompleteCallbacks: (() => void)[] = [];

    private constructor() {}

    static getInstance(): BrowserNavigationService {
        if (!BrowserNavigationService.instance) {
            BrowserNavigationService.instance = new BrowserNavigationService();
        }
        return BrowserNavigationService.instance;
    }

    // Navigation methods - ultra-simple, no blocking
    async navigateToHome(): Promise<void> {
        console.log('BrowserNavigationService: Navigating to home view');

        // Reset sort and filter state
        sortByStore.set("best");
        selectedBrandsStore.set(new Set());
        selectedOrganicStore.set("all");

        // Update navigation stores atomically
        selectedCategoryStore.set(null);
        selectedSubcategoryStore.set(null);
        selectedProductTypeStore.set('All');
        isHomeViewStore.set(true);
        searchModeStore.set(false);

        // Scroll to top
        this.scrollToTop();

        this.notifyNavigationComplete();
        console.log('BrowserNavigationService: Home navigation completed');
    }

    async navigateToCategory(category: string): Promise<void> {
        console.log(`BrowserNavigationService: Navigating to category: ${category}`);

        // Validate category
        if (!category || typeof category !== 'string') {
            console.error('BrowserNavigationService: Invalid category provided');
            return;
        }

        // Reset sort and filter state
        sortByStore.set("best");
        selectedBrandsStore.set(new Set());
        selectedOrganicStore.set("all");

        // Update navigation stores atomically
        selectedCategoryStore.set(category);
        selectedSubcategoryStore.set(null);
        selectedProductTypeStore.set('All');
        isHomeViewStore.set(false);
        searchModeStore.set(false);

        // Scroll to top
        this.scrollToTop();

        this.notifyNavigationComplete();
        console.log(`BrowserNavigationService: Category navigation completed: ${category}`);
    }

    async navigateToSubcategory(category: string, subcategory: string): Promise<void> {
        console.log(`BrowserNavigationService: Navigating to subcategory: ${category} > ${subcategory}`);

        // Validate parameters
        if (!category || !subcategory || typeof category !== 'string' || typeof subcategory !== 'string') {
            console.error('BrowserNavigationService: Invalid category or subcategory provided');
            return;
        }

        // Reset sort and filter state
        sortByStore.set("best");
        selectedBrandsStore.set(new Set());
        selectedOrganicStore.set("all");

        // Update navigation stores atomically
        selectedCategoryStore.set(category);
        selectedSubcategoryStore.set(subcategory);
        selectedProductTypeStore.set('All');
        isHomeViewStore.set(false);
        searchModeStore.set(false);

        // Scroll to top
        this.scrollToTop();

        this.notifyNavigationComplete();
        console.log(`BrowserNavigationService: Subcategory navigation completed: ${category} > ${subcategory}`);
    }

    async navigateToProductType(productType: string, category?: string, subcategory?: string): Promise<void> {
        console.log(`BrowserNavigationService: Navigating to product type: ${productType}`);

        // Validate product type
        if (!productType || typeof productType !== 'string') {
            console.error('BrowserNavigationService: Invalid product type provided');
            return;
        }

        // If category and subcategory are provided, update them too
        if (category && subcategory) {
            selectedCategoryStore.set(category);
            selectedSubcategoryStore.set(subcategory);
            isHomeViewStore.set(false);
            searchModeStore.set(false);
        }

        // Update product type
        selectedProductTypeStore.set(productType);

        this.notifyNavigationComplete();
        console.log(`BrowserNavigationService: Product type navigation completed: ${productType}`);
    }

    // Helper method for "View More" navigation
    async navigateViewMore(category: string, subcategory: string): Promise<void> {
        console.log(`BrowserNavigationService: View More navigation: ${category} > ${subcategory}`);
        return this.navigateToSubcategory(category, subcategory);
    }

    // Helper method to scroll to top during navigation
    private scrollToTop(): void {
        const scrollContainer = document.querySelector(".global-scroll-container");
        if (scrollContainer) {
            scrollContainer.scrollTop = 0;
        } else {
            window.scrollTo(0, 0);
        }
    }


    // Register callback to be called when navigation completes
    onNavigationComplete(callback: () => void): () => void {
        this.navigationCompleteCallbacks.push(callback);
        
        // Return unsubscribe function
        return () => {
            const index = this.navigationCompleteCallbacks.indexOf(callback);
            if (index > -1) {
                this.navigationCompleteCallbacks.splice(index, 1);
            }
        };
    }

    // Notify systems that navigation is complete
    private notifyNavigationComplete(): void {
        this.navigationCompleteCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Error in navigation complete callback:', error);
            }
        });
    }

}

// Export singleton instance
export const browserNavigationService = BrowserNavigationService.getInstance();