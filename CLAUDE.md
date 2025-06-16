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

### Holochain DNA Structure
**Single DNA**: `grocery` with three zome pairs:

**Integrity Zomes** (validation/types):
- `products_integrity`: Product and ProductGroup entries with dual categorization
- `cart_integrity`: Cart, address, preference entries
- `profiles_integrity`: User profile management

**Coordinator Zomes** (business logic):
- `product_catalog`: Product storage, search, categorization with performance grouping
- `cart`: Shopping cart, checkout, delivery scheduling, preferences
- `profiles`: Delegates to holochain-open-dev profiles

### Data Architecture Patterns

**Product Grouping**: Products are batched into ProductGroup entries (max 1000 each) for Holochain performance. Individual products link to their groups.

**Dual Categorization**: Products can belong to multiple categories via hierarchical links:
`categories/{category}/subcategories/{sub}/types/{type}`

**Hybrid Data Flow**:
1. External APIs → Express.js backend → AI categorization → JSON files
2. JSON → Svelte UI → Holochain DNA (batched writes)
3. Local semantic search with embeddings in browser

## Frontend Services Architecture

### Core Services (Svelte + TypeScript)
- **DataManager**: Centralized state management and business logic gateway
- **CartBusinessService**: Core cart state management (~350 lines) with reactive stores
- **CartInteractionService**: UI interaction wrapper - eliminates duplicated cart patterns
- **CartCalculationService**: Mathematical operations for cart totals and validation
- **CartPersistenceService**: localStorage + Holochain synchronization with merge strategies
- **BrowserNavigationService**: Single source of truth for navigation state
- **PreferencesService**: Product preference management using idiomatic Svelte stores
- **CheckoutService**: Checkout workflow and delivery time slot generation (~150 lines)
- **CheckedOutCartsService**: Order history and cart restoration (~200 lines)
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

**Context-Based**: Services injected via Svelte context for components
```typescript
const cartServiceStore = getContext<Writable<CartBusinessService | null>>("cartService");
```

### Service Access Patterns
1. **Context-based**: Components get CartBusinessService, CheckoutService, CheckedOutCartsService from Svelte context
2. **Prop-based**: CheckoutSummary receives CartBusinessService as prop
3. **Static utilities**: CartInteractionService, PriceService used as static classes; PreferencesService as reactive store
4. **Singleton services**: BrowserNavigationService accessed via import
5. **Direct client access**: PreferencesService has its own Holochain client

### Utility Layer (/utils/)
- **cartHelpers.ts**: Pure utility functions - `getIncrementValue()`, `getDisplayUnit()`, `isSoldByWeight()`, `parseProductHash()`
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

## Data Flow Patterns

### Cart Operations
```
UI Component → CartInteractionService (static methods) → CartBusinessService (reactive instance) → 
CartPersistenceService + CartCalculationService → DataManager → Holochain DHT
```

### Preference Operations
```
UI Component → PreferencesService (store + functions) → Direct Holochain calls (cart zome)
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

// 2. Service method calls (not direct state manipulation)
await CartInteractionService.addToCart(cartService, groupHash, productIndex);

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

### Holochain Development
- Use `npm run dev` for single-agent development
- Use `npm start` for multi-agent testing
- Holochain Playground automatically opens for network inspection
- 4-minute timeout configured for network tests

### Performance Considerations  
- **Bulk Operations**: Always batch Holochain writes for products
- **Concurrent DHT**: Use parallel operations for performance
- **Virtual Scrolling**: Implemented for large product lists
- **Multi-layer Caching**: Correction maps, embeddings, UI state

### Testing
**Framework**: Vitest with Tryorama for Holochain integration
**Location**: `/tests/` directory
**Pattern**: Integration tests for zome functions with network setup

## Recent Architecture Improvements

### PreferencesService Store Migration ✅
**Completed**: Radically simplified from 236-line class to 94-line idiomatic Svelte store
- **Before**: Complex Map-based factory patterns with manual subscriptions
- **After**: Single `writable` store with direct reactive access (`$preferences[key]`)
- **Impact**: ~270 lines eliminated, zero functionality loss
- **Pattern**: Demonstrates power of embracing Svelte's natural reactivity

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

## Service Migration Roadmap

### Completed ✅
- **PreferencesService**: Class → Svelte store (60% code reduction)

### Planned
- **AddressService**: Similar static class pattern to PreferencesService
- **CheckoutService**: Standalone service with clear boundaries  
- **CheckedOutCartsService**: Depends on CartBusinessService
- **CartBusinessService**: Most complex, biggest impact

**Migration Strategy**: One service at a time, maintain functionality, embrace Svelte patterns

## AI Categorization Pipeline
**Location**: `/product-categorization/`
- `api_categorizer.js`: Node.js orchestrator with batching
- `dual_bridge.py`: Python Gemini API wrapper  
- `categories.json`: Hierarchical category definitions
- `correction_map.json`: Manual category corrections

## Backend (Express.js - Temporary)
**Purpose**: Bridge for Kroger API and AI categorization (planned for Holochain migration)
**Key Endpoints**: `/api/products`, `/api/all-products`, `/api/categorize`, `/api/load-categorized-products`