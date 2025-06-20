# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment

**Required**: `nix develop` - All commands must run inside nix shell.

### Essential Commands
```bash
# Development
npm run dev          # Solo development (single agent)
npm start            # Multi-agent network (2 agents)
AGENTS=3 npm run network  # Custom network with N agents
npm test             # Run tests

# Build & Package
npm run build:zomes  # Build Rust zomes to WebAssembly
npm run build:happ   # Package complete Holochain app
npm run package      # Package web app for distribution

# Component Development
cd ui && npm run start    # Vite dev server
cd ui && npm run check    # Svelte type checking
cd backend && npm run dev # Nodemon with auto-reload
cd tests && npm run test  # Vitest integration tests
```

## Architecture Overview

### Holochain DNA Structure ✅ SPLIT COMPLETED
**Two Independent DNAs** with clean domain separation:

**Products DNA** (`products_role`):
- **Integrity Zome**: `product_catalog_integrity` - Product, ProductGroup, and ProductPreference entries
- **Coordinator Zome**: `product_catalog` - Product storage, search, categorization, and preference management

**Cart DNA** (`cart_role`):
- **Integrity Zomes**: `cart_integrity`, `profiles_integrity` - Cart operations and user profiles  
- **Coordinator Zomes**: `cart`, `profiles` - Shopping cart, checkout, delivery scheduling, and user management

### Data Architecture Patterns

**Product Grouping**: Products are batched into ProductGroup entries (max 1000 each) for Holochain performance. Individual products link to their groups.

**Dual Categorization**: Products can belong to multiple categories via hierarchical links:
`categories/{category}/subcategories/{sub}/types/{type}`

**Cart Data Architecture**: Cart items store complete product snapshots (name, price, image) at time of addition, eliminating dependencies on product catalog during cart operations.

**Preference Architecture**: Dual-layer preference system with clean separation:
- **Transactional Notes**: Stored in `CartProduct.note` (cart_dna) - temporary, session-specific
- **Master Preferences**: Stored in `ProductPreference` entries (products_dna) - persistent, reusable across sessions

**Hybrid Data Flow**:
1. External APIs → Express.js backend → AI categorization → JSON files
2. JSON → Svelte UI → Multi-DNA Holochain (batched writes to appropriate DNAs)
3. Local semantic search with embeddings in browser
4. Cross-DNA coordination via frontend orchestrator components

## Frontend Services Architecture

### Core Services (Svelte + TypeScript)
- **DataManager**: Centralized state management and business logic gateway
- **CartBusinessService**: Core cart state management (~350 lines) with reactive stores
- **CartInteractionService**: Functional cart operation utilities - eliminates duplicated cart patterns
- **CartCalculationService**: Mathematical operations for cart totals and validation
- **CartPersistenceService**: localStorage + Holochain synchronization with merge strategies
- **BrowserNavigationService**: Single source of truth for navigation state
- **PreferencesService**: Product preference management using idiomatic Svelte stores
- **CheckoutService**: Checkout workflow and delivery time slot generation (~150 lines)
- **OrdersService**: Order history and cart restoration (functional pattern)
- **AddressService**: Delivery address management
- **PriceService**: Single source of truth for price formatting and calculations (static utility)
- **ProductDataService**: Product loading with caching (accessed via DataManager)
- **EmbeddingService**: Local semantic search with transformers.js

### Service Patterns

**Reactive Stores**: Most services use Svelte's reactive store patterns
```typescript
// Example: PreferencesService (idiomatic Svelte)
export const preferences = writable<PreferencesMap>({});
export async function loadPreference(groupHash, productIndex) {
    preferences.update(prefs => ({...prefs, [key]: result}));
}
```

**Static Utilities**: Pure functions for calculations and formatting
```typescript
// Example: PriceService
export class PriceService {
    static getDisplayPrices(product) { /* price formatting */ }
    static calculateItemTotal(product, quantity) { /* calculations */ }
}
```

**Functional Exports**: Services export functions and stores directly for import
```typescript
import { addToCart, cartItems } from './services/CartBusinessService';
import { loadOrders } from './services/OrdersService';
```

### Service Access Patterns
1. **Direct imports**: All cart services use functional exports with direct imports
2. **Reactive stores**: Components access service state via exported Svelte stores
3. **Static utilities**: PriceService used as static class for calculations
4. **Functional services**: All cart services use functional patterns with direct exports
5. **Store-based**: PreferencesService exports reactive stores for state management

### Utility Layer (/utils/)
- **cartHelpers.ts**: Pure utility functions - `getIncrementValue()`, `getDisplayUnit()`, `isSoldByWeight()`, `parseProductHash()`
- **zomeHelpers.ts**: Holochain operation utilities - `encodeHash()`, `callZome()`, `standardizeHashFormat()`
- **errorHelpers.ts**: Consistent error handling patterns - `createSuccessResult()`, `createErrorResult()`, `validateClient()`
- **categoryUtils.ts**: Category navigation and filtering logic (pure functions)

## Component Architecture

### Navigation Components
- **CategorySidebar**: Category navigation with direct service calls
- **ShopView**: Layout manager for view routing
- **ProductBrowserData**: Data orchestrator with race condition protection
- **ProductBrowserView**: Pure presenter for product rows and grids

### Product Components
- **ProductCard**: Grid items with service delegation patterns
- **ProductDetailModal**: Product detail popup with preference integration
- **AllProductsGrid**: Virtual scrolling for large product lists
- **ProductRow**: Product rows with "View More" functionality

### Cart Components
- **SlideOutCart**: Cart sidebar with unified patterns
- **UnifiedCartItem**: Cart item display with service integration
- **CheckoutFlow**: Checkout process with address and timing
- **OrdersView**: Order history with cart restoration

## Key Performance Features

### Navigation Optimizations
- **Ultra-simple race condition protection**: 3-line navigation ID pattern
- **Debounced navigation**: Major changes = 0ms, Minor changes = 10ms
- **Loading state management**: Prevents empty grid flicker
- **Batched subcategory loading**: First 3 immediately, remaining in batches of 5

### Memory Optimizations
- **Eliminated object spread operations**: 60% reduction in allocations
- **Virtual scrolling**: Efficient rendering of large product lists
- **Multi-layer caching**: Correction maps, embeddings, UI state
- **Container capacity calculations**: Cached and reused
- **Product snapshots**: Cart operations use frozen data, eliminating repeated catalog lookups

## Data Flow Patterns

### Cart Operations
```
UI Component → CartInteractionService (functional utilities) → CartBusinessService (product snapshots) → 
CartPersistenceService (localStorage + Holochain sync) → Holochain DHT
```

### Preference Operations (POST-SPLIT)
```
UI Component (PreferencesSection.svelte) → Dual Orchestration:
├── CartInteractionService → cart_dna (transactional notes)
└── PreferencesService → products_dna (master preferences)
```

### Navigation Operations
```
UI Component → BrowserNavigationService → DataManager.updateNavigationState() → 
ProductBrowserData → API calls → Holochain DHT
```

## Architecture Principles

### SOLID Compliance
- **Single Responsibility**: Each service has one clear purpose
- **Open/Closed**: Easy to extend without modifying existing code
- **Dependency Inversion**: Components depend on service abstractions

### Key Integration Patterns
```typescript
// 1. Reactive service integration pattern
$: displayPrices = PriceService.getDisplayPrices(product);
$: incrementValue = getIncrementValue(product);

// 2. Direct functional service calls
import { addProductToCart, incrementItem } from './services/CartInteractionService';
await addProductToCart(groupHash, productIndex);

// 3. Direct reactive store access
await loadPreference(groupHash, productIndex);
$: preferenceData = $preferences[getPreferenceKey(groupHash, productIndex)];

// 4. Consistent hash handling (centralized in cartHelpers.ts)
const { groupHash, productIndex } = parseProductHash(effectiveHash);
```

## Environment Setup

### Required Environment Variables
**Backend** (`.env` in `backend/`):
```
KROGER_CLIENT_ID=your_kroger_client_id
KROGER_CLIENT_SECRET=your_kroger_client_secret  
GEMINI_API_KEY=your_gemini_api_key
```

### Dependencies Installation
```bash
npm install                    # Root workspace
cd backend && npm install      # Backend deps
cd ui && npm install          # UI deps  
cd product-categorization && pip install -r requirements.txt  # Python deps
```

## Development Workflow

### Holochain Development with Split DNAs
- Use `npm run dev` for single-agent development
- Use `npm start` for multi-agent testing
- **IMPORTANT**: Always rebuild DNAs after backend changes: `npm run build:happ`
- Holochain Playground automatically opens for network inspection
- 4-minute timeout configured for network tests

### Performance Considerations  
- **Bulk Operations**: Always batch Holochain writes for products
- **Concurrent DHT**: Use parallel operations for performance
- **Virtual Scrolling**: Implemented for large product lists
- **Multi-layer Caching**: Correction maps, embeddings, UI state

### Testing with Split Architecture
**Framework**: Vitest with Tryorama for Holochain integration
**Location**: `/tests/` directory
**Pattern**: Integration tests for zome functions with network setup
**CRITICAL**: Update tests to use new role names and zome structures

## Recent Architecture Improvements

### Service Architecture Transformation ✅
**Completed**: Systematic migration from class-based to functional Svelte patterns
- **Impact**: 40% average code reduction across all services
- **Pattern**: Direct store exports, zero context injection, functional composition
- **Result**: Consistent architecture, improved performance, simplified components

### Navigation Service Evolution ✅
**Completed**: Ultra-simple race condition protection with navigation ID pattern
- **Before**: Complex blocking patterns and event dispatching
- **After**: Direct store updates with 3-line race protection
- **Impact**: Components reduced from 20+ navigation lines to 1-3 lines each

### State Consolidation ✅
**Completed**: Eliminated scattered store files, consolidated into DataManager
- **Before**: Multiple separate stores (DataTriggerStore, categorySelectionStore, etc.)
- **After**: Single centralized NavigationState in DataManager
- **Impact**: Atomic state updates, zero race conditions, cleaner dependencies

## Cart System Architecture ✅

### Completed Transformations
- **PreferencesService**: Class → Svelte store (60% code reduction)
- **AddressService**: Class → Functional pattern (38% code reduction)  
- **CheckoutService**: Class → Functional pattern (31% code reduction)
- **CartBusinessService**: Class → Functional stores (40% code reduction)
- **OrdersService**: Class → Functional pattern (17% code reduction, renamed from CheckedOutCartsService)
- **CartCalculationService**: Class → Pure functional exports (22% code reduction)
- **CartPersistenceService**: Class → Pure functional exports (20% code reduction)
- **CartInteractionService**: Class → Functional utilities with zero legacy code

### Architecture Status: COMPLETE ✅
**Pattern**: All cart services follow consistent functional patterns with direct store access and zero context injection. Zero legacy code remaining - complete functional architecture achieved.

## AI Categorization Pipeline
**Location**: `/product-categorization/`
- `api_categorizer.js`: Node.js orchestrator with batching
- `dual_bridge.py`: Python Gemini API wrapper  
- `categories.json`: Hierarchical category definitions
- `correction_map.json`: Manual category corrections

## Backend (Express.js - Temporary)
**Purpose**: Bridge for Kroger API and AI categorization (planned for Holochain migration)
**Key Endpoints**: `/api/products`, `/api/all-products`, `/api/categorize`, `/api/load-categorized-products`

## CRITICAL: DNA SPLIT IMPLEMENTATION ✅ COMPLETED

### Migration Summary
**Date**: June 2025  
**Status**: Successfully split monolithic grocery DNA into two specialized DNAs

### Role & Zome Mapping ✅
**CRITICAL MAPPING** for all frontend calls:
- **products_role** + **product_catalog** zome: Product operations & preferences
- **cart_role** + **cart** zome: Shopping cart & address operations  
- **cart_role** + **profiles** zome: User profile operations

### Frontend Service Updates ✅
All service files updated with correct role routing:

**Products/Preferences → products_role**:
- `ProductDataService.ts`: All calls use `products_role` + `product_catalog`
- `DHTSyncService.ts`: All calls use `products_role` + `product_catalog`
- `SearchCacheService.ts`: Uses `products_role` + `product_catalog`
- `search-api.ts`: All calls use `products_role` + `product_catalog`
- `PreferencesService.ts`: Uses `products_role` + `product_catalog`

**Cart/Address/Profiles → cart_role**:
- `CartPersistenceService.ts`: Uses `cart_role` + `cart`
- `AddressService.ts`: Uses `cart_role` + `cart`
- `CheckoutService.ts`: Uses `cart_role` + `cart`
- `OrdersService.ts`: Uses `cart_role` + `cart`

### Build System ✅
```json
{
  "scripts": {
    "build:happ": "npm run build:zomes && hc dna pack dnas/products/workdir && hc dna pack dnas/cart/workdir && hc app pack workdir"
  }
}
```

### Product Preference Architecture ✅

#### Dual-Layer System
The Product Preference feature implements a sophisticated dual-layer architecture:

**Transactional Notes (cart_dna)**:
- **Purpose**: Session-specific notes for current cart items
- **Storage**: `CartProduct.note` field in cart_dna
- **Access**: Via `CartInteractionService.updateQuantity()`

**Master Preferences (products_dna)**:
- **Purpose**: Persistent user preferences reusable across sessions
- **Storage**: `ProductPreference` entries in products_dna
- **Access**: Via `PreferencesService` functions

#### UI Orchestration
**Components**: 
- `PreferencesSection.svelte` - Frontend orchestrator coordinating both DNAs
- `ProductDetailModal.svelte` - Loads and displays preferences with clean initialization
- `UnifiedCartItem.svelte` - Displays session notes with master preference fallback

**Display Priority**:
- Session notes (cart_dna) take priority over master preferences (products_dna)
- `UnifiedCartItem`: Shows `cartItem.note || masterPreference.note`
- `ProductDetailModal`: Loads master preferences explicitly in `loadProductPreference()`

**Save Logic**:
- **"Save" Only**: Updates `CartProduct.note` (session note)
- **"Save" + "Remember"**: Updates both `CartProduct.note` AND `ProductPreference`
- **Empty text + "Remember"**: Deletes master preference (clears remembered preference)

### Architecture Verification ✅
- ✅ Zero ProductPreference references in cart_dna
- ✅ Complete preference migration to products_dna  
- ✅ No redundant code - each function exists once
- ✅ Proper zome separation maintained
- ✅ Correct role routing for all preference calls
- ✅ Clean service boundaries with no cross-dependencies

### Secure Address System Architecture ✅

#### Dual-Address Pattern
**Address Book (Reusable Addresses)**:
- **Storage**: `Address` entries in cart_dna linked via `AgentToAddress`
- **Purpose**: User's personal address management (Home, Work, etc.)
- **Access**: Via `AddressService.ts` (CRUD operations)

**Order Address Copies (Immutable Shipping Labels)**:
- **Storage**: Private `Address` entries linked via `OrderToPrivateAddress` 
- **Purpose**: Immutable shipping addresses for specific orders
- **Creation**: `create_order_address_copy_impl()` during checkout

#### Security Features
- **Address Privacy**: Orders use immutable address copies, customer address changes don't affect historical orders
- **Clean Separation**: Address book management vs order address storage completely separate
- **Access Control**: `get_address_for_order_impl()` verifies order ownership before returning address

#### Service Architecture
- **AddressService.ts**: Functional pattern, address book CRUD
- **CheckoutService.ts**: Creates private address copies during checkout
- **OrdersService.ts**: Secure address retrieval with `getOrderAddress()`

## Critical Reminders for Future Development

### Frontend Development
- **ALWAYS** use correct role names:
  - `products_role` + `product_catalog` for products and preferences
  - `cart_role` + `cart` for cart and addresses
  - `cart_role` + `profiles` for user profiles
- **RESTART conductor** after DNA changes
- **Use orchestrator components** like PreferencesSection.svelte for cross-DNA operations

### Backend Development  
- **Preference logic** lives in products_dna ONLY
- **No cross-DNA direct calls** - use frontend coordination
- **Build both DNAs** when making changes: `npm run build:happ`

### Common Pitfalls to Avoid
- Using old "grocery" role name (causes "no cell found" errors)
- Calling wrong zome names (products vs product_catalog)
- Forgetting to rebuild DNAs after manifest changes
- Adding preference logic back to cart_dna

# Important Instruction Reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
ALWAYS use the new split DNA architecture when working on this codebase.