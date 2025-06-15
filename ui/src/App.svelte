<script lang="ts">
  import Controller from "./Controller.svelte";
  import {
    AppWebsocket,
    AdminWebsocket,
    type AppWebsocketConnectionOptions,
  } from "@holochain/client";
  import "@shoelace-style/shoelace/dist/themes/light.css";
  import { CartBusinessService } from "./cart/services/CartBusinessService";
  import { CheckoutService } from "./cart/services/CheckoutService";
  import { CheckedOutCartsService } from "./cart/services/CheckedOutCartsService";
  import { AddressService } from "./cart/services/AddressService";
  import { setPreferencesClient } from "./products/services/PreferencesService";
  import { setContext } from "svelte";
  import { writable } from "svelte/store";
  import { ShopStore, type StoreContext } from "./store";

  // Import Profiles components
  import { ProfilesStore, ProfilesClient } from "@holochain-open-dev/profiles";
  import "@holochain-open-dev/profiles/dist/elements/profiles-context.js";
  import "@holochain-open-dev/profiles/dist/elements/create-profile.js";

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
  let profilesStore: ProfilesStore;
  let shopStoreInstance: ShopStore | null = null;

  // Create a single cart service that all components can access
  // Start with a writable that we'll set once connected
  const cartService = writable<CartBusinessService | null>(null);
  setContext("cartService", cartService);

  // Create a writable for the checkout service
  const checkoutServiceStore = writable<CheckoutService | null>(null);
  setContext("checkoutService", checkoutServiceStore);

  // Create a writable for the checked out carts service
  const checkedOutCartsServiceStore = writable<CheckedOutCartsService | null>(
    null,
  );
  setContext("checkedOutCartsService", checkedOutCartsServiceStore);

  // Create a writable for the address service
  const addressServiceStore = writable<AddressService | null>(null);
  setContext("addressService", addressServiceStore);

  // Set the "store" context immediately. shopStoreInstance is initially null.
  setContext<StoreContext>("store", {
    getStore: () => shopStoreInstance,
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

    // Initialize ShopStore once client is available
    shopStoreInstance = new ShopStore(client, roleName);

    // Now that we have a client, initialize the cart service and set it in the store
    const cartServiceInstance = new CartBusinessService(client);
    console.log("CartBusinessService created with client:", !!client);
    cartService.set(cartServiceInstance); // Set the instance into the cartService store

    // Initialize the checkout service with dependencies
    const checkoutServiceInstance = new CheckoutService(
      client,
      cartServiceInstance.getPersistenceService(),
      cartServiceInstance,
    );
    console.log("CheckoutService created with client:", !!client);
    checkoutServiceStore.set(checkoutServiceInstance);

    // Initialize the checked out carts service with dependencies
    const checkedOutCartsServiceInstance = new CheckedOutCartsService(
      client,
      cartServiceInstance,
    );
    console.log("CheckedOutCartsService created with client:", !!client);
    checkedOutCartsServiceStore.set(checkedOutCartsServiceInstance);

    // Initialize the address service
    const addressServiceInstance = new AddressService(client);
    console.log("AddressService created with client:", !!client);
    addressServiceStore.set(addressServiceInstance); // Update the address service store

    // Initialize PreferencesService with client
    setPreferencesClient(client);

    // Initialize ProfilesStore
    profilesStore = new ProfilesStore(new ProfilesClient(client, "grocery"), {
      avatarMode: "avatar-optional",
      minNicknameLength: 2,
      additionalFields: [],
    });

    connected = true;
  }

  // Use Svelte's reactive statement to watch profilesStore
  $: prof = profilesStore ? profilesStore.myProfile : undefined;
  $: profValue = $prof && ($prof as any).value;

  function handleProfileCreated(event: CustomEvent) {
    console.log("Profile created event:", event);
    console.log("Event detail:", event.detail);
  }
</script>

<svelte:head>
  <link
    href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

{#if connected}
  <profiles-context store={profilesStore}>
    {#if !prof || ($prof && $prof.status === "pending")}
      <div class="loading-container">
        <div class="loading-wrapper">
          <div class="pulse-ring"></div>
          <div class="loader"></div>
          <p class="loading-text">Connecting to the network...</p>
        </div>
      </div>
    {:else if $prof && $prof.status === "complete" && !profValue}
      <div class="welcome-container">
        <div class="welcome-card">
          <div class="welcome-header">
            <h1 class="welcome-title">Welcome to</h1>
            <span class="app-logo">SUMN.</span>
          </div>
          <p class="welcome-subtitle">
            Please create your profile to continue.
          </p>
          <div class="profile-creator">
            <create-profile on:profile-created={handleProfileCreated}
            ></create-profile>
          </div>
        </div>
      </div>
    {:else}
      <Controller {client} {roleName}></Controller>
    {/if}
  </profiles-context>
{:else}
  <div class="loading-container">
    <div class="loading-wrapper">
      <div class="pulse-ring"></div>
      <div class="loader"></div>
      <p class="loading-text">Initializing application...</p>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    font-family: var(
      --font-family,
      "Plus Jakarta Sans",
      -apple-system,
      BlinkMacSystemFont,
      sans-serif
    );
    background: var(--background, #f7fff7);
    color: var(--text-primary, #2f353a);
  }

  /* Loading screen styling */
  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100%;
    background: linear-gradient(
      135deg,
      var(--background, #f7fff7) 0%,
      var(--surface, #ffffff) 100%
    );
  }

  .loading-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
  }

  .pulse-ring {
    position: absolute;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      var(--primary, #00cfbb) 0%,
      transparent 70%
    );
    opacity: 0.2;
    animation: pulse 2s infinite;
  }

  .loader {
    width: 60px;
    height: 60px;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top: 4px solid var(--primary, #00cfbb);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    animation: spin 1.5s linear infinite;
    z-index: 2;
    background: var(--surface, #ffffff);
  }

  .loading-text {
    margin-top: var(--spacing-lg, 20px);
    font-size: var(--font-size-md, 16px);
    color: var(--text-secondary, #5a7a7a);
    font-weight: var(--font-weight-semibold, 600);
    text-align: center;
  }

  /* Welcome screen styling */
  .welcome-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: var(--spacing-lg, 20px);
    background: linear-gradient(
      135deg,
      var(--background, #f2fffe) 0%,
      var(--surface, #ffffff) 100%
    );
  }

  .welcome-card {
    background: var(--surface, #ffffff);
    border-radius: var(--card-border-radius, 12px);
    box-shadow: var(--shadow-medium, 0 4px 12px rgba(0, 0, 0, 0.15));
    padding: var(--spacing-xxl, 32px);
    max-width: 500px;
    width: 100%;
    animation: scaleIn var(--transition-normal, 300ms) ease forwards;
  }

  .welcome-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: var(--spacing-xl, 24px);
  }

  .welcome-title {
    font-size: 32px;
    font-weight: var(--font-weight-bold, 700);
    color: var(--text-primary, #1e3a3a);
    margin: 0 0 var(--spacing-md, 16px) 0;
    text-align: center;
  }

  /* Styled text logo (replacing PNG image) */
  .app-logo {
    font-size: 45px;
    font-weight: var(--font-weight-bold, 700);
    color: var(--text-primary, #ffffff);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: transform var(--transition-normal, 300ms) ease;
    display: inline-block;
  }

  .welcome-subtitle {
    text-align: center;
    font-size: var(--font-size-md, 16px);
    color: var(--text-secondary, #5a7a7a);
    margin-bottom: var(--spacing-xl, 24px);
  }

  .profile-creator {
    width: 100%;
  }

  /* Enhanced Shoelace component styling */
  :global(create-profile) {
    width: 100%;
    box-shadow: none;

    /* Input styling */
    --sl-input-height-medium: var(--btn-height-md, 50px);
    --sl-input-color: var(--text-primary, #1e3a3a);
    --sl-input-placeholder-color: var(--text-secondary, #5a7a7a);
    --sl-input-background-color: var(--surface, #ffffff);
    --sl-input-border-color: var(--border, #ccf2ee);
    --sl-input-border-color-hover: var(--primary, #00cfbb);
    --sl-input-border-color-focus: var(--primary, #00cfbb);
    --sl-input-border-radius-medium: var(--btn-border-radius, 50px);
    --sl-focus-ring-color: var(--primary, #00cfbb);
    --sl-panel-background-color: var(--background, #f2fffe);
    --sl-font-family: var(--font-family, "Plus Jakarta Sans", sans-serif);

    /* Button styling - correct variable names for Shoelace */
    --sl-button-font-size-medium: var(--font-size-md, 16px);
    --sl-button-height-medium: var(--btn-height-md, 50px);
    --sl-button-border-radius-medium: var(--btn-border-radius, 50px);
    --sl-button-font-weight-medium: var(--font-weight-semibold, 600);

    /* Primary button styling */
    --sl-color-primary-500: var(--primary, #00cfbb) !important;
    --sl-color-primary-600: var(--primary-dark, #00b3a1) !important;
    --sl-color-primary-950: var(--primary-dark, #00b3a1) !important;
    --sl-color-primary-text: var(--button-text, #ffffff) !important;

    /* Default button */
    --sl-color-neutral-0: var(--surface, #ffffff) !important;
    --sl-color-neutral-400: var(--border, #ccf2ee) !important;
    --sl-color-neutral-700: var(--text-primary, #1e3a3a) !important;
  }

  /* Direct styling of Shoelace button parts for gradient and effects */
  :global(create-profile) ::part(button) {
    transition: all 0.25s ease !important;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
      opacity: 0.2;
    }
    50% {
      transform: scale(1.5);
      opacity: 0.1;
    }
    100% {
      transform: scale(1);
      opacity: 0.2;
    }
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
