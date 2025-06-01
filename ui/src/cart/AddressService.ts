import { encodeHashToBase64, decodeHashFromBase64 } from '@holochain/client';
import { writable, get } from 'svelte/store';

// Type for Address object
export interface Address {
    street: string;
    unit?: string | null;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
    is_default: boolean;
    label?: string | null;
}

// Type alias for base64-encoded action hash
type ActionHashB64 = string;

export class AddressService {
    // Store for addresses
    private addresses = writable<Map<ActionHashB64, Address>>(new Map());

    // Store for loading state
    public loading = writable<boolean>(false);

    constructor(private client: any) {
        console.log("AddressService initialized");

        // Initial loading of addresses
        this.loadAddresses();
    }

    // Load all addresses from Holochain
    public async loadAddresses() {
        try {
            this.loading.set(true);

            if (this.client) {
                console.log("Fetching addresses from Holochain");
                const result = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'get_addresses',
                    payload: null
                });

                if (Array.isArray(result)) {
                    const addressMap = new Map<ActionHashB64, Address>();

                    result.forEach(([hash, address]) => {
                        const hashB64 = encodeHashToBase64(hash);
                        addressMap.set(hashB64, address);
                    });

                    this.addresses.set(addressMap);
                    console.log("Loaded", addressMap.size, "addresses");
                }
            }
        } catch (error) {
            console.error('Error loading addresses:', error);
        } finally {
            this.loading.set(false);
        }
    }

    // Create a new address
    public async createAddress(address: Address) {
        try {
            if (this.client) {
                const result = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'create_address',
                    payload: address
                });

                const hashB64 = encodeHashToBase64(result);

                // Update the local store
                const addressMap = new Map(get(this.addresses));
                addressMap.set(hashB64, address);
                this.addresses.set(addressMap);

                // If this is a default address, update other addresses
                if (address.is_default) {
                    this.updateDefaultAddress(hashB64);
                }

                return { success: true, hash: hashB64 };
            }
        } catch (error) {
            console.error('Error creating address:', error);
            return { success: false, error };
        }

        return { success: false, error: 'Client not available' };
    }

    // Update an existing address
    public async updateAddress(hashB64: ActionHashB64, address: Address) {
        try {
            if (this.client) {
                const hash = decodeHashFromBase64(hashB64);

                const result = await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'update_address',
                    payload: [hash, address]
                });

                // Update the local store
                const addressMap = new Map(get(this.addresses));
                addressMap.set(hashB64, address);
                this.addresses.set(addressMap);

                // If this is a default address, update other addresses
                if (address.is_default) {
                    this.updateDefaultAddress(hashB64);
                }

                return { success: true };
            }
        } catch (error) {
            console.error('Error updating address:', error);
            return { success: false, error };
        }

        return { success: false, error: 'Client not available' };
    }

    // Delete an address
    public async deleteAddress(hashB64: ActionHashB64) {
        try {
            if (this.client) {
                const hash = decodeHashFromBase64(hashB64);

                await this.client.callZome({
                    role_name: 'grocery',
                    zome_name: 'cart',
                    fn_name: 'delete_address',
                    payload: hash
                });

                // Update the local store
                const addressMap = new Map(get(this.addresses));
                addressMap.delete(hashB64);
                this.addresses.set(addressMap);

                return { success: true };
            }
        } catch (error) {
            console.error('Error deleting address:', error);
            return { success: false, error };
        }

        return { success: false, error: 'Client not available' };
    }

    // Get all addresses
    public getAddresses() {
        return this.addresses;
    }

    // Get a specific address
    public getAddress(hashB64: ActionHashB64) {
        const addressMap = get(this.addresses);
        return addressMap.get(hashB64);
    }

    // Get the default address
    public getDefaultAddress() {
        const addressMap = get(this.addresses);

        for (const [hash, address] of addressMap.entries()) {
            if (address.is_default) {
                return { hash, address };
            }
        }

        // Return the first address if no default
        if (addressMap.size > 0) {
            const firstEntry = addressMap.entries().next().value;
            if (firstEntry) {
                return { hash: firstEntry[0], address: firstEntry[1] };
            }
        }

        return null;
    }

    // Helper method to mark one address as default and others as non-default
    private updateDefaultAddress(defaultHashB64: ActionHashB64) {
        const addressMap = get(this.addresses);

        const updatedMap = new Map(addressMap);

        for (const [hash, address] of updatedMap.entries()) {
            if (hash !== defaultHashB64 && address.is_default) {
                updatedMap.set(hash, { ...address, is_default: false });
            }
        }

        this.addresses.set(updatedMap);
    }

    // Validate an address using OpenStreetMap Nominatim API
    public async validateAddress(address: Address): Promise<{
        valid: boolean;
        lat?: number;
        lng?: number;
        message?: string;
    }> {
        try {
            // Format the address query
            const addressQuery = encodeURIComponent(
                `${address.street}, ${address.city}, ${address.state} ${address.zip}`
            );

            // Call Nominatim API
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${addressQuery}&addressdetails=1`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'SummonGrocery/1.0' // Be nice to the API
                    }
                }
            );

            const data = await response.json();

            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);

                // Calculate distance from Ralphs in Encinitas
                const ralphsLat = 33.0382;
                const ralphsLng = -117.2613;

                const distance = this.calculateDistance(
                    lat, lng, ralphsLat, ralphsLng
                );

                // Check if within 3 miles
                if (distance <= 3) {
                    return {
                        valid: true,
                        lat,
                        lng
                    };
                } else {
                    return {
                        valid: false,
                        lat,
                        lng,
                        message: `This address is ${distance.toFixed(1)} miles from our store. We only deliver within 3 miles.`
                    };
                }
            } else {
                return {
                    valid: false,
                    message: 'Address could not be validated. Please check and try again.'
                };
            }
        } catch (error) {
            console.error('Error validating address:', error);
            return {
                valid: false,
                message: 'Error validating address. Please try again later.'
            };
        }
    }

    // Calculate distance between two coordinates in miles
    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 3958.8; // Earth's radius in miles
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return distance;
    }

    private deg2rad(deg: number): number {
        return deg * (Math.PI / 180);
    }
}