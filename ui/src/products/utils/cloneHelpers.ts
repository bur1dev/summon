/**
 * Centralized clone discovery utilities for versioned product catalog cloning.
 * Simple, reliable clone management with no caching complexity.
 */

/**
 * Get the cell_id for the current active clone - THE MAIN FUNCTION YOU NEED
 * Always gets the latest active clone via 2-hop query (reliable, no stale data)
 * Polls every 500ms until we have the latest clone
 */
export async function getActiveCloneCellId(client: any): Promise<any> {
    const delayMs = 500;
    let attempt = 0;

    while (true) {
        attempt++;

        try {
            console.log(`[CloneHelpers] Getting active clone cell ID (attempt ${attempt})...`);

            // Step 1: Get active seed from products-directory DNA
            const activeSeed = await client.callZome({
                role_name: "products_directory",
                zome_name: "products_directory",
                fn_name: "get_active_catalog",
                payload: null
            });

            if (!activeSeed) {
                throw new Error('No active catalog found - no clone available');
            }

            console.log(`[CloneHelpers] Found active seed: ${activeSeed.slice(0, 8)}`);

            // Step 2: Find or create the clone
            const cellId = await findOrCreateClone(client, activeSeed);

            if (cellId) {
                console.log(`[CloneHelpers] ✅ Got active clone cell ID on attempt ${attempt}`);
                return cellId;
            }

            // If we couldn't get the clone, wait and retry
            console.log(`[CloneHelpers] Could not get clone, waiting ${delayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));

        } catch (error: any) {
            console.log(`[CloneHelpers] Error on attempt ${attempt}:`, error.message);

            // Wait before retry for any error
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

/**
 * Find existing clone or create new one for the given seed
 */
async function findOrCreateClone(client: any, seed: string): Promise<any> {
    // First try to find existing clone
    const existingCellId = await findExistingClone(client, seed);
    if (existingCellId) {
        console.log('[CloneHelpers] Found existing clone locally');
        return existingCellId;
    }

    // Clone doesn't exist locally, create it
    console.log('[CloneHelpers] Creating new clone for seed:', seed.slice(0, 8));

    try {
        const clonedCell = await client.createCloneCell({
            role_name: "products_role",
            modifiers: { network_seed: seed },
            name: `products-clone-${seed.slice(0, 8)}`
        });

        const cellId = [clonedCell.cell_id[0], client.myPubKey];
        console.log('[CloneHelpers] Successfully created clone');
        return cellId;

    } catch (error: any) {
        // Handle race condition - clone was created by another process
        if (error.message?.includes("DuplicateCellId") || error.data?.data?.includes("DuplicateCellId")) {
            console.log('[CloneHelpers] Clone already exists, finding it...');
            const cellId = await findExistingClone(client, seed);
            if (cellId) {
                return cellId;
            }
        }
        throw error;
    }
}

/**
 * Find existing clone cell ID for a given seed - polls until we have the latest clone
 */
async function findExistingClone(client: any, seed: string): Promise<any | null> {
    try {
        const appInfo = await client.appInfo();
        const clonedCellInfo = appInfo.cell_info["products_role"]
            ?.find((c: any) => {
                if (c.type === 'cloned' && c.value) {
                    const nameMatch = c.value.name === seed;
                    const dnaModifiersMatch = c.value.dna_modifiers?.network_seed === seed;
                    const modifiersMatch = c.value.modifiers?.network_seed === seed;
                    return nameMatch || dnaModifiersMatch || modifiersMatch;
                }
                return false;
            });

        if (clonedCellInfo?.value) {
            return [clonedCellInfo.value.cell_id[0], client.myPubKey];
        }

        return null;
    } catch (error) {
        console.error('[CloneHelpers] Error finding existing clone:', error);
        return null;
    }
}

/**
 * Get the currently active clone network seed from the products-directory DNA
 * (Used by DHTSyncService for clone management)
 */
export async function getActiveClone(client: any): Promise<string> {
    try {
        const activeSeed = await client.callZome({
            role_name: "products_directory",
            zome_name: "products_directory",
            fn_name: "get_active_catalog",
            payload: null
        });

        if (!activeSeed) {
            throw new Error('No active catalog found - versioned cloning system requires an active catalog');
        }

        return activeSeed;
    } catch (error) {
        console.error("[CloneHelpers] Failed to get active catalog:", error);
        throw error;
    }
}

// Legacy findDnaHashForSeed function removed - use findExistingClone instead

/**
 * Activate a new clone by updating the active catalog
 */
export async function activateClone(client: any, clonedCell: any): Promise<string> {
    // Extract network seed from clone modifiers
    const networkSeed = clonedCell.dna_modifiers?.network_seed || clonedCell.modifiers?.network_seed;

    if (!networkSeed) {
        throw new Error('No network seed found in cloned cell');
    }

    await client.callZome({
        role_name: 'products_directory',
        zome_name: 'products_directory',
        fn_name: 'update_active_catalog',
        payload: networkSeed
    });

    return networkSeed;
}

/**
 * Disable the previous clone using the old seed
 */
export async function disablePreviousClone(client: any, oldActiveSeed: string): Promise<void> {
    if (!oldActiveSeed) return;

    try {
        await client.callZome({
            role_name: 'products_directory',
            zome_name: 'products_directory',
            fn_name: 'disable_previous_clone',
            payload: oldActiveSeed
        });
    } catch (error) {
        console.warn("[CloneHelpers] Failed to disable previous clone (non-critical):", error);
        // Non-critical error - don't throw, just log warning
    }
}