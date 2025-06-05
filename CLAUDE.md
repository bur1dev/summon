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
npm run build-check  # Type check + build

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

## Migration Strategy

**Current State**: Hybrid architecture with Express.js backend
**Future Plans**: 
1. Move API integration to Holochain zomes
2. Implement decentralized product categorization  
3. Achieve full peer-to-peer operation

The codebase is designed for gradual migration from centralized to decentralized components.