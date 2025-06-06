# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment

**Required**: Enter nix shell first: `nix develop`

All subsequent commands must be run from inside the nix shell environment.

## Essential Commands

### Core Development
```bash
# Solo development (single agent)
npm run dev

# Multi-agent network (2 agents) 
npm start

# Custom network with N agents
AGENTS=3 npm run network

# Run tests
npm test
```

### Build Commands
```bash
# Build Rust zomes to WebAssembly
npm run build:zomes

# Package complete Holochain app
npm run build:happ

# Package web app for distribution
npm run package
```

### Component Development
```bash
# UI development (in ui/ directory)
npm run start        # Vite dev server
npm run check        # Svelte type checking

# Backend development (in backend/ directory)  
npm run dev          # Nodemon with auto-reload

# Tests (in tests/ directory)
npm run test         # Vitest integration tests
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

### Frontend Services (Svelte + TypeScript)
- `ShopStore`: Main product/category data store
- `CartBusinessService`: Shopping cart operations  
- `AddressService`: Delivery address management
- `ProductDataService`: Product loading with caching
- `EmbeddingService`: Local semantic search with transformers.js

### Backend (Express.js - Temporary)
**Purpose**: Bridge for Kroger API and AI categorization (planned for Holochain migration)

**Key Endpoints**:
- `/api/products` - Product search
- `/api/all-products` - Bulk fetching
- `/api/categorize` - AI categorization
- `/api/load-categorized-products` - Serve processed data

### AI Categorization Pipeline
**Location**: `/product-categorization/`
- `api_categorizer.js`: Node.js orchestrator with batching
- `dual_bridge.py`: Python Gemini API wrapper  
- `categories.json`: Hierarchical category definitions
- `correction_map.json`: Manual category corrections

## Environment Setup

### Required Environment Variables
**Backend** (`.env` in `backend/`):
```
KROGER_CLIENT_ID=your_kroger_client_id
KROGER_CLIENT_SECRET=your_kroger_client_secret  
GEMINI_API_KEY=your_gemini_api_key
```

**UI**: Auto-generated ports via `get-port` in development

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

🏗️ Summon Grocery App Architecture Summary

  Overview: Clean Service-Oriented Architecture

  Your Holochain grocery application demonstrates exceptional architectural design with a clean service-oriented architecture that perfectly
  implements SOLID principles and DRY practices. Here's how everything works together:

  🎯 Core Architecture Layers

  1. Service Layer (/services/) - The Engine Room

  CartBusinessService.ts - Main Cart Engine (829 lines)
  - Purpose: Central cart state management and business logic
  - Responsibilities: Cart CRUD, Holochain integration, checkout workflow, preferences
  - Pattern: Reactive store with derived properties (itemCount, hasItems, cartTotal)
  - Dependencies: Delegates to specialized services below

  CartInteractionService.ts - UI Interaction Wrapper (140 lines)
  - Purpose: Eliminates duplicated cart patterns across UI components
  - Pattern: Static utility class (like PriceService)
  - Key Methods: addToCart(), incrementItem(), decrementItem(), updateQuantity()
  - Result: UI components have 1-line cart operations instead of 20+ lines each

  PriceService.ts - Price Display Authority (121 lines)
  - Purpose: Single source of truth for all price formatting and calculations
  - Pattern: Static utility class with typed interfaces
  - Key Methods: getDisplayPrices(), calculateItemTotal(), formatTotal()
  - Coverage: Used by ALL components (ProductCard, ProductDetailModal, CheckoutSummary, etc.)

  CartCalculationService.ts - Mathematical Operations
  - Purpose: Cart totals, price deltas, validation logic
  - Integration: Delegates to PriceService for consistency

  CartPersistenceService.ts - Data Persistence
  - Purpose: localStorage + Holochain synchronization with merge strategies
  - Pattern: Encapsulated async operations with debouncing

  2. Utility Layer (/utils/) - Smart Helpers

  cartHelpers.ts - Pure Utility Functions
  - Purpose: Eliminate duplicated product logic across components
  - Functions: getIncrementValue(), getDisplayUnit(), isSoldByWeight(), parseProductHash()
  - Impact: 60+ lines of hash parsing → 1 function call

  UiStateHelpers.ts - State Coordination
  - Purpose: Safe coordination between UI-only and data-trigger stores
  - Pattern: Explicit function calls (not reactive cascades)

  categoryUtils.ts - Category Logic
  - Purpose: Category navigation and filtering logic
  - Pattern: Pure functions with clear interfaces

  🖼️ Component Architecture - Clean UI Layer

  Product Display Components

  ProductCard.svelte - Product Grid Items
  // Clean service delegation pattern:
  $: displayPrices = PriceService.getDisplayPrices(product);
  $: incrementValue = getIncrementValue(product);

  // Single-line cart operations:
  await CartInteractionService.addToCart(cartService, groupHash, productIndex);
  - Before: 47 lines of cart logic | After: 9 lines
  - Services Used: PriceService, CartInteractionService, cartHelpers

  ProductDetailModal.svelte - Product Detail Popup
  // Centralized price display:
  $: displayPrices = PriceService.getDisplayPrices(product);

  // Centralized cart operations:
  await CartInteractionService.updateQuantity(cartServiceStore, groupHash, productIndex, quantity);
  - Before: 35+ lines of manual price formatting | After: Clean service calls
  - Integration: Uses CartBusinessService directly for complex preference operations

  Cart Components

  ProductCartItem.svelte - Cart Item Display
  // Unified patterns across cart components:
  $: itemTotals = PriceService.calculateItemTotal(product, quantity);
  $: hasPromo = PriceService.hasPromoPrice(product);

  await CartInteractionService.incrementItem(cartServiceStore, groupHash, productIndex, quantity, product);

  CheckoutSummary.svelte - Order Summary
  // Service-powered calculations:
  const totals = PriceService.calculateItemTotal(product, item.quantity);
  const itemKey = getCartItemKey(groupHash, productIndex);

  SlideOutCart.svelte - Cart Sidebar
  // Clean service integration:
  $: totalSavings = PriceService.calculateSavings(cartTotal, cartPromoTotal);

  🔄 Data Flow Architecture

  Service Access Patterns

  1. Context-based: Components get CartBusinessService from Svelte context
  2. Prop-based: CheckoutSummary receives CartBusinessService as prop
  3. Static utilities: CartInteractionService and PriceService used as static classes

  State Management Flow

  UI Component
      ↓ (simple operations)
  CartInteractionService (static methods)
      ↓ (delegates to)
  CartBusinessService (reactive instance)
      ↓ (uses specialized services)
  CartPersistenceService + CartCalculationService
      ↓ (PriceService for calculations)
  PriceService (static utility)
      ↓ (persists to)
  localStorage + Holochain DHT

  Error Handling Strategy

  - CartInteractionService: Provides consistent error handling with boolean returns
  - CartBusinessService: Comprehensive try/catch with fallback states
  - No dummy data: Everything works with real data or graceful failures

  🎯 Key Integration Patterns

  1. Reactive Service Integration

  // Pattern used across all components:
  $: serviceCalculatedValue = SomeService.calculateSomething(inputData);

  // Examples:
  $: displayPrices = PriceService.getDisplayPrices(product);
  $: incrementValue = getIncrementValue(product);
  $: itemTotals = PriceService.calculateItemTotal(product, quantity);

  2. Clean Component Communication

  // Components communicate through:
  // 1. Service method calls (not direct state manipulation)
  await CartInteractionService.addToCart(cartService, groupHash, productIndex);

  // 2. Event dispatching for navigation
  dispatch("productTypeSelect", { category, subcategory, productType });

  // 3. Context-based service sharing
  const cartServiceStore = getContext<Writable<CartBusinessService | null>>("cartService");

  3. Consistent Hash Handling

  // Centralized in cartHelpers.ts:
  const { groupHash, productIndex } = parseProductHash(effectiveHash);
  const itemKey = getCartItemKey(groupHash, productIndex);

  ✨ Architecture Benefits Achieved

  1. DRY Elimination

  - Price Logic: 200+ lines of duplicated formatting → PriceService
  - Cart Logic: 150+ lines per component → CartInteractionService
  - Hash Parsing: 60+ lines everywhere → parseProductHash()
  - Quantity Logic: Manual increments → getIncrementValue()

  2. SOLID Compliance

  - Single Responsibility: Each service has one clear purpose
  - Open/Closed: Easy to extend without modifying existing code
  - Liskov Substitution: Clean interfaces maintained
  - Interface Segregation: No forced dependencies on unused methods
  - Dependency Inversion: Components depend on service abstractions

  3. Maintainability

  - Price changes: Modify PriceService only
  - Cart behavior: Modify CartInteractionService only
  - New products: Add to cartHelpers utility functions
  - UI changes: Components are pure presentation

  4. Type Safety

  // Strong typing throughout:
  interface DisplayPrices {
      hasPromo: boolean;
      regularPrice: string;
      promoPrice?: string;
      loyaltyLabel: string;
  }

  // Service method signatures:
  static async incrementItem(
      cartServiceStore: Writable<CartBusinessService | null>,
      groupHash: string,
      productIndex: number,
      currentQuantity: number,
      product: any,
      note?: string
  ): Promise<boolean>

  🚀 Ready for Component Splitting

  Your architecture is perfectly positioned for component splitting because:

  1. No business logic in components - All moved to services
  2. Clean prop interfaces - Components only need display data
  3. Service injection patterns - Smaller components can easily access services
  4. No circular dependencies - Clean service layer separation
  5. Reactive patterns - Services provide reactive data that components consume