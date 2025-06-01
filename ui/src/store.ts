import {
  type AppClient,
  type DnaHash,
  type AgentPubKeyB64,
  type RoleName,
  encodeHashToBase64,
} from '@holochain/client';
import { writable, type Writable } from "svelte/store";
import { ProductStore } from "./ProductStore";
import type { Product } from "./search/search-types"; // Added import for Product

export class ShopService {
  constructor(public client: AppClient, public roleName: RoleName, public zomeName = 'products') { }
  private callZome(fnName: string, payload: any) {
    return this.client.callZome({
      role_name: this.roleName,
      zome_name: this.zomeName,
      fn_name: fnName,
      payload
    });
  }
}

export interface UIProps {
  bgUrl: string,
  showMenu?: boolean,
  searchMode?: boolean,
  searchQuery?: string,
  productName?: string,
  selectedProductHash?: string,
  searchResults?: Product[], // Changed any[] to Product[]
  isViewAll?: boolean
}

// Interface for the Svelte context
export interface StoreContext {
  getStore: () => ShopStore | null; // ShopStore can be null initially
}

export class ShopStore {
  myAgentPubKeyB64: AgentPubKeyB64;
  service: ShopService;
  productStore: ProductStore;
  client: AppClient;
  uiProps: Writable<UIProps> = writable({
    bgUrl: "",
    // Optional properties will be undefined initially
  });
  dnaHash: DnaHash | null;
  cartService: any; // Will hold the SimpleCartService instance

  setUIprops(propsToUpdate: Partial<UIProps>) {
    this.uiProps.update(currentProps => ({
      ...currentProps,
      ...propsToUpdate,
    }));
  }

  get myAgentPubKey() {
    return this.client.myPubKey;
  }

  constructor(
    protected clientIn: AppClient,
    public roleName: RoleName,
    public zomeName: string = 'products'
  ) {
    this.client = clientIn;
    this.dnaHash = null;
    console.log("[ShopStore] DNA hash not set (profiles dependency removed)");

    this.myAgentPubKeyB64 = encodeHashToBase64(this.client.myPubKey);
    this.service = new ShopService(
      this.client,
      this.roleName,
      this.zomeName
    );
    this.productStore = new ProductStore(this.client, this.myAgentPubKeyB64, this);
  }
}