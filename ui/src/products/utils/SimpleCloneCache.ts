/**
 * Simple clone cache with TTL to eliminate repeated directory queries
 */

import type { AppClient, CellId } from "@holochain/client";
import { getActiveCloneCellId } from "./cloneHelpers";
import { startCloneSetup, updateCloneSetup, finishCloneSetup } from "../../stores/LoadingStore";

export class SimpleCloneCache {
    private cachedCellId: CellId | null = null;
    private cachedSeed: string | null = null;
    private client: AppClient;
    private backgroundManager: any = null; // Will be set by BackgroundCloneManager
    private setupInProgress: boolean = false; // Prevent race conditions

    constructor(client: AppClient) {
        this.client = client;
    }

    setBackgroundManager(manager: any) {
        this.backgroundManager = manager;
    }

    /**
     * Get active cell_id - uses cache or throws error if not ready
     */
    async getActiveCellId(): Promise<CellId> {
        // If setup is already in progress, wait for it to complete
        if (this.setupInProgress) {
            console.log('⏳ Setup already in progress - waiting...');
            while (this.setupInProgress) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            // After setup completes, try again
            return this.getActiveCellId();
        }

        // Check if we need daily setup OR if we have no cache
        const needsDailySetup = this.backgroundManager && this.backgroundManager.shouldRunDailySetup();
        const hasNoCache = !this.cachedCellId;
        
        if (needsDailySetup || hasNoCache) {
            // Lock setup to prevent race conditions
            this.setupInProgress = true;
            
            try {
                if (needsDailySetup) {
                    console.log('🕒 Daily setup needed - triggering background manager');
                    startCloneSetup('Checking for catalog updates...');
                }
                if (hasNoCache) {
                    console.log('📭 No cached clone - triggering background manager');
                    startCloneSetup('Setting up catalog access...');
                }
                
                updateCloneSetup('Preparing clone system...', 25);
                this.clearCache(); // Clear cache to force refresh
                
                updateCloneSetup('Connecting to catalog...', 50);
                await this.backgroundManager.setup();
                
                updateCloneSetup('Loading initial data...', 75);
                // Pre-load some data to prevent UI crashes
                const preloadSuccess = await this.preloadInitialData();
                if (!preloadSuccess) {
                    console.warn('⚠️ Preload failed but continuing with setup');
                }
                
                updateCloneSetup('Syncing with network...', 90);
                // Wait until we can actually see data (scalable approach)
                console.log('⏱️ Waiting for DHT data to be available...');
                const dataAvailable = await this.waitForDataAvailability();
                if (!dataAvailable) {
                    console.warn('⚠️ Data verification failed but continuing');
                }
                
                updateCloneSetup('Ready!', 100);
                setTimeout(() => {
                    finishCloneSetup();
                }, 500);
                
            } finally {
                // Always unlock setup, even if it fails
                this.setupInProgress = false;
            }
        }

        // Use cache if available
        if (this.cachedCellId) {
            console.log('📋 Using cached cell_id');
            return this.cachedCellId;
        }

        // Cache miss - try to find existing clone
        console.log('🔍 Cache miss - looking for existing clone');
        try {
            const cellId = await getActiveCloneCellId(this.client);
            this.cachedCellId = cellId;
            console.log('✅ Found existing clone and cached');
            return cellId;
        } catch (error) {
            console.log('⚠️ No clone available - background manager should create it');
            throw new Error('Clone not ready - please wait for background setup');
        }
    }

    /**
     * Update cache with pre-created clone (called by background manager)
     */
    updateCache(cellId: CellId, seed: string) {
        this.cachedCellId = cellId;
        this.cachedSeed = seed;
        console.log(`📋 Cache updated with clone for seed: ${seed.slice(0, 8)}`);
    }

    /**
     * Clear cache (called on zome call errors)
     */
    clearCache() {
        // Don't clear cache if setup is in progress
        if (this.setupInProgress) {
            console.log('⏳ Skipping cache clear - setup in progress');
            return;
        }
        console.log('🗑️ Cache invalidated - will fetch fresh cell_id on next call');
        this.cachedCellId = null;
    }

    /**
     * Pre-load initial data to prevent UI crashes
     */
    private async preloadInitialData() {
        try {
            if (!this.cachedCellId) {
                console.log('⚠️ No cached cell_id for preloading data');
                return false;
            }

            console.log('📡 Pre-loading initial data to prevent UI crashes...');
            
            // Make a simple call to verify the clone is working and has data
            const result = await this.client.callZome({
                cell_id: this.cachedCellId,
                zome_name: "product_catalog",
                fn_name: "get_all_category_products",
                payload: "Produce" // Simple test call
            });
            
            console.log('✅ Initial data pre-loaded successfully:', result ? 'Data found' : 'No data');
            return true;
        } catch (error) {
            console.error('❌ Failed to pre-load initial data - this will cause UI issues:', error);
            // Don't clear cache here as the clone might still work for other calls
            return false;
        }
    }

    /**
     * Wait until data is actually available from DHT (scalable approach)
     * Polls every 2 seconds up to 15 seconds maximum
     */
    private async waitForDataAvailability(): Promise<boolean> {
        const MAX_WAIT_TIME = 15000; // 15 seconds max (reduced)
        const POLL_INTERVAL = 2000;  // Check every 2 seconds (less frequent)
        const startTime = Date.now();
        
        let attempt = 0;
        while (Date.now() - startTime < MAX_WAIT_TIME) {
            attempt++;
            try {
                if (!this.cachedCellId) {
                    console.log('⚠️ No cached cell_id for data verification');
                    return false;
                }

                // Try to fetch data using the same pattern that works in the UI
                // Use get_all_category_products which is simpler and more reliable
                const result = await this.client.callZome({
                    cell_id: this.cachedCellId,
                    zome_name: "product_catalog",
                    fn_name: "get_all_category_products",
                    payload: "Produce"
                });
                
                console.log(`🔍 Data check attempt ${attempt}:`, result);
                
                // Check if we got any products (use same logic as working calls)
                const hasProducts = result?.product_groups?.length > 0;
                
                if (hasProducts) {
                    console.log(`✅ DHT data verified after ${attempt} attempts (${Date.now() - startTime}ms)`);
                    return true;
                }
                
                console.log(`🔄 Attempt ${attempt}: No data yet, waiting...`);
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
                
            } catch (error) {
                console.log(`🔄 Attempt ${attempt}: Error checking data (${error}), retrying...`);
                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            }
        }
        
        console.warn(`⚠️ DHT data verification timeout after ${MAX_WAIT_TIME}ms`);
        return false;
    }

    /**
     * Check if cache is populated
     */
    isCached(): boolean {
        return this.cachedCellId !== null;
    }
}