<script lang="ts">
  import Controller from "./Controller.svelte";
  import {
    AppWebsocket,
    AdminWebsocket,
    type AppWebsocketConnectionOptions,
  } from "@holochain/client";
  import "@shoelace-style/shoelace/dist/themes/light.css";
  import { SimpleCartService } from "./CART/SimpleCartService";
  import { AddressService } from "./CART/AddressService";
  import { setContext } from "svelte";
  import { writable } from "svelte/store";

  const appId = import.meta.env.VITE_APP_ID
    ? import.meta.env.VITE_APP_ID
    : "summon";
  const roleName = "grocery";
  const appPort = import.meta.env.VITE_APP_PORT
    ? import.meta.env.VITE_APP_PORT
    : 8888;
  const adminPort = import.meta.env.VITE_ADMIN_PORT;
  const url = `ws://127.0.0.1:${appPort}`;

  let client: any;

  // Create a single cart service that all components can access
  // Start with a writable that we'll set once connected
  const cartService = writable(null);
  setContext("cartService", cartService);

  // Create a writable for the address service
  const addressService = writable(null);
  setContext("addressService", addressService);

  // Create a store object with references that can be updated later
  const storeObj = {
    simpleCartService: null,
    addressService: null,
  };

  // Provide the store context
  setContext("store", {
    getStore: () => storeObj,
  });

  let connected = false;

  // Then start the async initialization
  initialize();

  async function initialize(): Promise<void> {
    let tokenResp;

    if (adminPort) {
      const url = `ws://localhost:${adminPort}`;

      const adminWebsocket = await AdminWebsocket.connect({
        url: new URL(url),
      });
      tokenResp = await adminWebsocket.issueAppAuthenticationToken({
        installed_app_id: appId,
      });
      const x = await adminWebsocket.listApps({});
      console.log("apps", x);
      const cellIds = await adminWebsocket.listCellIds();
      console.log("CELL IDS", cellIds);

      // Authorize all cells
      for (const cellId of cellIds) {
        await adminWebsocket.authorizeSigningCredentials(cellId);
      }
    }

    console.log("appPort and Id is", appPort, appId);
    const params: AppWebsocketConnectionOptions = { url: new URL(url) };
    if (tokenResp) params.token = tokenResp.token;
    client = await AppWebsocket.connect(params);

    // Now that we have a client, initialize the cart service and set it in the context
    const simpleCartService = new SimpleCartService(client);
    console.log("SimpleCartService created with client:", !!client);

    // Initialize the address service
    const addressServiceInstance = new AddressService(client);
    console.log("AddressService created with client:", !!client);

    // Update the store with the actual services
    cartService.set(simpleCartService);
    addressService.set(addressServiceInstance);

    // Update the store object reference directly
    storeObj.simpleCartService = simpleCartService;
    storeObj.addressService = addressServiceInstance;

    console.log("App.svelte - storeObj updated:", {
      hasSimpleCartService: !!storeObj.simpleCartService,
      hasAddressService: !!storeObj.addressService,
      storeObjectKeys: Object.keys(storeObj),
    });

    connected = true;
  }
</script>

<svelte:head></svelte:head>
{#if connected}
  <Controller {client} {roleName}></Controller>
{:else}
  <div class="loading"><div class="loader"></div></div>
{/if}

<style>
  .welcome-text {
    margin-bottom: 40px;
  }
  .create-profile {
    padding-top: 100px;
    margin-left: auto;
    margin-right: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  create-profile {
    box-shadow: 0px 10px 10px rgba(0, 0, 0, 0.15);
  }
  :global(body) {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  :global(.loading) {
    text-align: center;
    padding-top: 100px;
    display: flex;
    margin-left: auto;
    margin-right: auto;
    align-items: center;
  }
  :global(.loader) {
    border: 8px solid #f3f3f3;
    border-radius: 50%;
    border-top: 8px solid #3498db;
    width: 50px;
    height: 50px;
    -webkit-animation: spin 2s linear infinite; /* Safari */
    animation: spin 2s linear infinite;
    display: inline-block;
  }
  @-webkit-keyframes spin {
    0% {
      -webkit-transform: rotate(0deg);
    }
    100% {
      -webkit-transform: rotate(360deg);
    }
  }
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
</style>
