import type { DataManager } from './DataManager';

export class BrowserNavigationService {
    private static instance: BrowserNavigationService | null = null;
    private navigationCompleteCallbacks: (() => void)[] = [];
    private dataManager: DataManager | null = null;

    private constructor() {}

    // Set the DataManager instance (called during app initialization)
    setDataManager(dataManager: DataManager): void {
        this.dataManager = dataManager;
    }

    static getInstance(): BrowserNavigationService {
        if (!BrowserNavigationService.instance) {
            BrowserNavigationService.instance = new BrowserNavigationService();
        }
        return BrowserNavigationService.instance;
    }

    // Navigation methods - ultra-simple, no blocking
    async navigateToHome(): Promise<void> {
        console.log('BrowserNavigationService: Navigating to home view');

        if (!this.dataManager) {
            console.error('BrowserNavigationService: DataManager not set. Call setDataManager() first.');
            return;
        }

        // Exit search mode first
        await this.exitSearchMode();

        // Update navigation state through DataManager (including filter reset)
        this.dataManager.updateNavigationState({
            category: null,
            subcategory: null,
            productType: 'All',
            isHomeView: true,
            searchMode: false,
            sortBy: 'best',
            selectedBrands: new Set(),
            selectedOrganic: 'all'
        });

        // Scroll to top
        this.scrollToTop();

        this.notifyNavigationComplete();
        console.log('BrowserNavigationService: Home navigation completed');
    }

    async navigateToCategory(category: string): Promise<void> {
        console.log(`BrowserNavigationService: Navigating to category: ${category}`);

        if (!this.dataManager) {
            console.error('BrowserNavigationService: DataManager not set. Call setDataManager() first.');
            return;
        }

        // Validate category
        if (!category || typeof category !== 'string') {
            console.error('BrowserNavigationService: Invalid category provided');
            return;
        }

        // Exit search mode first
        await this.exitSearchMode();

        // Update navigation state through DataManager (including filter reset)
        this.dataManager.updateNavigationState({
            category: category,
            subcategory: null,
            productType: 'All',
            isHomeView: false,
            searchMode: false,
            sortBy: 'best',
            selectedBrands: new Set(),
            selectedOrganic: 'all'
        });

        // Scroll to top
        this.scrollToTop();

        this.notifyNavigationComplete();
        console.log(`BrowserNavigationService: Category navigation completed: ${category}`);
    }

    async navigateToSubcategory(category: string, subcategory: string): Promise<void> {
        console.log(`BrowserNavigationService: Navigating to subcategory: ${category} > ${subcategory}`);

        if (!this.dataManager) {
            console.error('BrowserNavigationService: DataManager not set. Call setDataManager() first.');
            return;
        }

        // Validate parameters
        if (!category || !subcategory || typeof category !== 'string' || typeof subcategory !== 'string') {
            console.error('BrowserNavigationService: Invalid category or subcategory provided');
            return;
        }

        // Exit search mode first
        await this.exitSearchMode();

        // Update navigation state through DataManager (including filter reset)
        this.dataManager.updateNavigationState({
            category: category,
            subcategory: subcategory,
            productType: 'All',
            isHomeView: false,
            searchMode: false,
            sortBy: 'best',
            selectedBrands: new Set(),
            selectedOrganic: 'all'
        });

        // Scroll to top
        this.scrollToTop();

        this.notifyNavigationComplete();
        console.log(`BrowserNavigationService: Subcategory navigation completed: ${category} > ${subcategory}`);
    }

    async navigateToProductType(productType: string, category?: string, subcategory?: string): Promise<void> {
        console.log(`BrowserNavigationService: Navigating to product type: ${productType}`);

        if (!this.dataManager) {
            console.error('BrowserNavigationService: DataManager not set. Call setDataManager() first.');
            return;
        }

        // Validate product type
        if (!productType || typeof productType !== 'string') {
            console.error('BrowserNavigationService: Invalid product type provided');
            return;
        }

        // Exit search mode first
        await this.exitSearchMode();

        // Create navigation update object (including filter reset)
        const navigationUpdate: any = {
            productType: productType,
            sortBy: 'best',
            selectedBrands: new Set(),
            selectedOrganic: 'all'
        };

        // If category and subcategory are provided, include them
        if (category && subcategory) {
            navigationUpdate.category = category;
            navigationUpdate.subcategory = subcategory;
            navigationUpdate.isHomeView = false;
            navigationUpdate.searchMode = false;
        }

        // Update navigation state through DataManager
        this.dataManager.updateNavigationState(navigationUpdate);

        // Scroll to top (same as other navigation methods)
        this.scrollToTop();

        this.notifyNavigationComplete();
        console.log(`BrowserNavigationService: Product type navigation completed: ${productType}`);
    }

    // Helper method for "View More" navigation
    async navigateViewMore(category: string, subcategory: string): Promise<void> {
        console.log(`BrowserNavigationService: View More navigation: ${category} > ${subcategory}`);
        return this.navigateToSubcategory(category, subcategory);
    }

    // Search navigation methods
    async enterSearchMode(searchQuery: string): Promise<void> {
        console.log(`BrowserNavigationService: Entering search mode with query: ${searchQuery}`);

        if (!this.dataManager) {
            console.error('BrowserNavigationService: DataManager not set. Call setDataManager() first.');
            return;
        }

        // Update navigation state through DataManager (single source of truth)
        this.dataManager.updateNavigationState({
            searchMode: true,
            searchQuery: searchQuery
        });

        console.log('BrowserNavigationService: Search mode entered');
    }

    async exitSearchMode(): Promise<void> {
        console.log('BrowserNavigationService: Exiting search mode');

        if (!this.dataManager) {
            console.error('BrowserNavigationService: DataManager not set. Call setDataManager() first.');
            return;
        }

        // Update navigation state through DataManager (single source of truth)
        this.dataManager.updateNavigationState({
            searchMode: false,
            searchQuery: ''
        });

        console.log('BrowserNavigationService: Search mode exited');
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