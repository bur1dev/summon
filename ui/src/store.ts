import {
  type AppClient,
  type DnaHash,
  type AgentPubKeyB64,
  type RoleName,
  encodeHashToBase64,
} from '@holochain/client';
import { writable, type Writable } from "svelte/store";
import { ProductStore } from "./ProductStore";
import type { ProductCacheStore } from "./ProductCacheStore";

export class ShopService {
  constructor(public client: AppClient, public roleName, public zomeName = 'products') { }
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
  fuseResults?: any[],
  isViewAll?: boolean
}

export class ShopStore {
  myAgentPubKeyB64: AgentPubKeyB64;
  service: ShopService;
  productStore: ProductStore;
  productCache: ProductCacheStore;
  client: AppClient;
  uiProps: Writable<UIProps> = writable({
    bgUrl: "",
  });
  dnaHash: DnaHash;
  cartService: any; // Will hold the SimpleCartService instance

  setUIprops(props: {}) {
    this.uiProps.update((n) => {
      Object.keys(props).forEach((key) => (n[key] = props[key]));
      return n;
    });
  }

  get myAgentPubKey() {
    return this.client.myPubKey;
  }

  constructor(
    protected clientIn: AppClient,
    public roleName: RoleName,
    public zomeName: string = 'products'
  ) {
    console.log("[ShopStore] Constructor initialized");
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