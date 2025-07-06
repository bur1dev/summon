/**
 * Centralized clone discovery utilities for versioned product catalog cloning.
 * All product services should use these functions instead of implementing their own clone logic.
 */

/**
 * Get the currently active clone network seed from the products-directory DNA
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

/**
 * Find the DnaHash for a given network seed in the app's clone cells
 */
export async function findDnaHashForSeed(client: any, seed: string): Promise<any> {
    try {
        const appInfo = await client.appInfo();
        
        const clonedCellInfo = appInfo.cell_info["products_role"]
            .find((c: any) => {
                if (c.type === 'cloned' && c.value) {
                    return c.value.name === seed || 
                           c.value.dna_modifiers?.network_seed === seed ||
                           c.value.modifiers?.network_seed === seed;
                }
                return false;
            });

        if (!clonedCellInfo || !clonedCellInfo.value) {
            throw new Error(`Clone cell not found for seed: ${seed}`);
        }
        
        return clonedCellInfo.value.cell_id[0];
    } catch (error) {
        console.error("[CloneHelpers] Failed to find DNA hash for seed:", error);
        throw error;
    }
}

/**
 * Get the cell_id for targeting the current active clone
 * This is the main function that services should use for clone targeting
 */
export async function getActiveCloneCellId(client: any): Promise<any> {
    const activeSeed = await getActiveClone(client);
    const dnaHash = await findDnaHashForSeed(client, activeSeed);
    const cellId = [dnaHash, client.myPubKey];
    
    return cellId;
}

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