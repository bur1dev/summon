import {
  type AppClient,
  type DnaHash,
  type AgentPubKeyB64,
  type RoleName,
  encodeHashToBase64,
} from '@holochain/client';
import { writable, type Writable } from "svelte/store";
import { ProductStore } from "./ProductStore";

export class TalkingStickiesService {
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
  showArchived: { [key: string]: boolean },
  showMenu: boolean,
  recent: Array<string>
  bgUrl: string,
  searchMode?: boolean,
  searchQuery?: string,
  productName?: string,
  selectedProductHash?: string,
  fuseResults?: any[],
  isViewAll?: boolean
}

export class TalkingStickiesStore {
  myAgentPubKeyB64: AgentPubKeyB64;
  service: TalkingStickiesService;
  productStore: ProductStore;
  client: AppClient;
  uiProps: Writable<UIProps> = writable({
    showArchived: {},
    showMenu: true,
    recent: [],
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
    console.log("[TalkingStickiesStore] Constructor initialized");
    this.client = clientIn;
    // DNA hash is no longer fetched from profiles zome
    this.dnaHash = null;
    console.log("[TalkingStickiesStore] DNA hash not set (profiles dependency removed)");

    this.myAgentPubKeyB64 = encodeHashToBase64(this.client.myPubKey);
    this.service = new TalkingStickiesService(
      this.client,
      this.roleName,
      this.zomeName
    );
    this.productStore = new ProductStore(this.client, this.myAgentPubKeyB64, this);
  }
}