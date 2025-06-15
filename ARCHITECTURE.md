# Summon Architecture: Store-Based Service Migration

## Overview

This document outlines the architectural migration from class-based services to idiomatic Svelte store patterns. The goal is to eliminate subscription boilerplate and enable Svelte's reactive `$` syntax throughout the application.

## The Problem with Class-Based Services

Our current architecture uses class-based services (like `PreferencesService`, `CartBusinessService`) that require manual subscription management in every component. This creates several issues:

1. **Boilerplate Code**: Every component needs `onMount`, `onDestroy`, and manual subscription management
2. **Memory Leaks**: Easy to forget to unsubscribe, leading to memory leaks
3. **Anti-Pattern**: Static classes managing state go against Svelte's reactive principles
4. **Complex Testing**: Hard to test components that manage their own subscriptions
5. **Verbose Code**: 20+ lines of subscription code per component instead of simple `$store` syntax

### Example of Current Problem

```typescript
// Current: Lots of boilerplate in every component
let unsubscribe: (() => void) | null = null;
let preferenceState: any = null;

onMount(() => {
    const store = PreferencesService.getPreferenceStore(groupHash, productIndex);
    unsubscribe = store.subscribe(value => {
        preferenceState = value;
    });
});

onDestroy(() => {
    if (unsubscribe) {
        unsubscribe();
    }
});

// Use preferenceState.loading, preferenceState.preference, etc.
```

## The Solution: Store-Based Architecture

We're migrating to idiomatic Svelte patterns where services are stores that can be directly consumed with `$` syntax.

### New Architecture Pattern

```typescript
// New: Clean store-based service
export const preferences = createPreferencesStore();

// Components can use directly:
$: loading = $preferences.loading;
$: preference = $preferences.preference;
```

### Key Principles

1. **Stores as Services**: Services are Svelte stores, not classes
2. **Reactive by Default**: Enable `$` syntax everywhere
3. **No Manual Subscriptions**: Svelte handles subscription lifecycle
4. **Composable**: Stores can be composed and derived
5. **Testable**: Easy to mock and test

## Migration Strategy

### Phase 1: PreferencesService ✅

**Why Start Here:**
- Simplest service (~200 lines)
- Already an anti-pattern (static class managing state)
- Used in fewer components
- Good test case for the new pattern

**Migration Steps:**
1. Convert static class to store factory function
2. Maintain exact same API surface
3. Update components to use `$` syntax
4. Remove all subscription boilerplate

### Phase 2: Remaining Services (Planned)

**Migration Order:**
1. ✅ **PreferencesService** - Simple, static class
2. **AddressService** - Similar pattern to PreferencesService
3. **CheckoutService** - Standalone service with clear boundaries
4. **CheckedOutCartsService** - Depends on CartBusinessService
5. **CartBusinessService** - Most complex, biggest impact

### Phase 3: Advanced Patterns (Future)

- Derived stores for computed values
- Store composition for complex state
- Custom store operators
- Optimistic updates with rollback

## Store Design Patterns

### 1. Simple Store Pattern

For straightforward state management:

```typescript
export function createPreferencesStore() {
    const { subscribe, set, update } = writable(initialState);
    
    return {
        subscribe,
        loadPreference: async (groupHash, productIndex) => {
            // Implementation
        },
        savePreference: async (groupHash, productIndex, note) => {
            // Implementation
        }
    };
}
```

### 2. Keyed Store Pattern

For managing multiple instances (like product preferences):

```typescript
export function createKeyedPreferencesStore() {
    const stores = new Map();
    
    return {
        getStore: (key) => {
            if (!stores.has(key)) {
                stores.set(key, writable(initialState));
            }
            return stores.get(key);
        },
        loadPreference: async (groupHash, productIndex) => {
            const store = getStore(`${groupHash}_${productIndex}`);
            // Implementation
        }
    };
}
```

### 3. Service Store Pattern

For complex services with multiple methods:

```typescript
export function createCartStore() {
    const { subscribe, set, update } = writable(initialState);
    
    return {
        subscribe,
        // Derived stores
        itemCount: derived(store, $store => $store.items.length),
        total: derived(store, $store => calculateTotal($store.items)),
        
        // Actions
        addToCart: async (item) => { /* implementation */ },
        removeFromCart: async (id) => { /* implementation */ },
        clearCart: async () => { /* implementation */ }
    };
}
```

## Component Integration Patterns

### Before: Manual Subscription Management

```typescript
// 20+ lines of boilerplate per component
let unsubscribe: (() => void) | null = null;
let preferenceState: any = null;

onMount(() => {
    const store = PreferencesService.getPreferenceStore(groupHash, productIndex);
    unsubscribe = store.subscribe(value => {
        preferenceState = value;
    });
});

onDestroy(() => {
    if (unsubscribe) {
        unsubscribe();
    }
});

// Usage
$: loading = preferenceState?.loading;
$: preference = preferenceState?.preference;
```

### After: Reactive Store Usage

```typescript
// 2-3 lines total
const preferenceStore = preferences.getStore(groupHash, productIndex);

// Direct reactive usage
$: loading = $preferenceStore.loading;
$: preference = $preferenceStore.preference;
$: savePreference = $preferenceStore.savePreference;
```

## Benefits Achieved

### Code Reduction
- **50-100 lines** of subscription boilerplate eliminated per component
- **No more manual lifecycle management**
- **Simpler component logic**

### Developer Experience
- **Reactive `$` syntax** throughout the application
- **No memory leaks** from forgotten unsubscribes
- **Cleaner component code**
- **Better TypeScript support**

### Maintainability
- **Single source of truth** for each service
- **Composable stores** for complex state
- **Easier testing** with mockable stores
- **Consistent patterns** across the codebase

### Performance
- **Svelte's optimized reactivity** handles subscriptions
- **No manual subscription overhead**
- **Efficient updates** with derived stores

## Implementation Guidelines

### Do's
- ✅ Use `writable`, `readable`, `derived` from `svelte/store`
- ✅ Maintain existing API surface during migration
- ✅ Test thoroughly to ensure no regression
- ✅ Use TypeScript for type safety
- ✅ Leverage Svelte's reactive statements (`$:`)

### Don'ts
- ❌ Don't change functionality during migration
- ❌ Don't use static classes for state management
- ❌ Don't manually subscribe/unsubscribe in components
- ❌ Don't create new patterns without documenting them
- ❌ Don't rush - migrate one service at a time

## Migration Checklist

### PreferencesService Migration ✅
- [x] Analyze current implementation
- [x] Create store-based version
- [x] Update ProductDetailModal component
- [x] Update PreferencesSection component
- [x] Update App.svelte initialization
- [x] Test functionality
- [x] Document code reduction

### Future Migrations
- [ ] AddressService
- [ ] CheckoutService
- [ ] CheckedOutCartsService
- [ ] CartBusinessService

## Testing Strategy

### Unit Tests
- Test store functions independently
- Mock Holochain client calls
- Verify state updates

### Integration Tests
- Test component integration with stores
- Verify reactive updates
- Test error handling

### Performance Tests
- Measure subscription overhead reduction
- Test memory usage improvements
- Verify update performance

## Success Metrics

### Code Quality
- **Lines of code reduced** per component
- **Subscription boilerplate eliminated**
- **TypeScript coverage maintained**

### Developer Experience
- **Faster development** with reactive syntax
- **Fewer bugs** from subscription management
- **Easier onboarding** with consistent patterns

### Performance
- **Memory usage** reduction
- **Update efficiency** improvements
- **Bundle size** optimization

## Conclusion

The migration to store-based architecture represents a fundamental improvement in code quality, developer experience, and maintainability. By leveraging Svelte's reactive principles, we eliminate hundreds of lines of boilerplate code while making the application more robust and easier to develop.

The success of PreferencesService migration demonstrates the value of this approach and provides a blueprint for migrating the remaining services. Each migration should be done carefully, one service at a time, with thorough testing to ensure no regression in functionality.

This architecture positions the application for future enhancements and provides a solid foundation for scaling the codebase while maintaining clean, idiomatic Svelte patterns.