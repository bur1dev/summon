# SUMMON (customer facing application)

# Features

- Browse products by categories, subcategories and product types
- Product search with categorization
- Shopping cart with real-time updates
- User profiles with avatar support
- Address management for deliveries
- Delivery scheduling and instructions
- Order history tracking and management

### Current state

- **Frontend**: Svelte-based UI components
- **Backend**: Express.js server (index.js) for product fetching and multimodal LLM powered categorization
- **Data Storage**: Holochain DHT for user categorized product data, profiles, cart management, and orders

There are also two test buttons—"Fetch Products" and "Load Saved Data"—in the header container for testing purposes. To use them, you need to run npm run dev in the Express.js backend directory. However, fetching data requires Kroger API credentials, which you can obtain from https://developer.kroger.com/.

### Future Plans

The Express.js backend is temporary. Future plans include:

1. Migrating product fetching logic to Holochain zomes
2. Implementing decentralized product categorization
3. Reducing dependency on servers

## Environment Setup

> PREREQUISITE: set up the [holochain development environment](https://developer.holochain.org/docs/install/).

Outside of nix shell you will need rust installed:

https://www.rust-lang.org/tools/install or https://rustup.rs/

Enter the nix shell by running this in the root folder of the repository: 

```bash
nix develop
npm install
```

**Run all the other instructions in this README from inside this nix-shell, otherwise they won't work**.

## Running 2 agents
 
```bash
npm start
```

This will create a network of 2 nodes connected to each other and their respective UIs.
It will also bring up the Holochain Playground for advanced introspection of the conductors.

## Running solo dev environment

```bash
npm run dev
```

This will not launch a UI, you will have to open a browser window and navigate to the Local address provided by VITE. It can take a moment for the UI to come up after visiting the URL, let it load. 

## Bootstrapping a network

Create a custom network of nodes connected to each other and their respective UIs with:

```bash
AGENTS=3 npm run network
```

Substitute the "3" for the number of nodes that you want to bootstrap in your network.
This will also bring up the Holochain Playground for advanced introspection of the conductors.
