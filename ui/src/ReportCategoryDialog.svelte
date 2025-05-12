<script>
    import { createEventDispatcher } from "svelte";
    import { mainCategories } from "./categoryData";
    import { X } from "lucide-svelte"; // Add this line or add X to existing lucide-svelte import

    const dispatch = createEventDispatcher();

    export let product;
    export let isOpen = false;

    let selectedCategory = product.category;
    let selectedSubcategory = null;
    let selectedProductType = null;
    let notes = "";

    let subcategories = [];
    let productTypes = [];

    // Reactive statements to update options
    // Reactive statements to update options
    $: {
        subcategories =
            mainCategories.find((c) => c.name === selectedCategory)
                ?.subcategories || [];
        // Reset subcategory when category changes
        if (
            selectedSubcategory &&
            !subcategories.find((s) => s.name === selectedSubcategory)
        ) {
            selectedSubcategory = null;
        }
    }

    $: {
        productTypes =
            subcategories.find((s) => s.name === selectedSubcategory)
                ?.productTypes || [];
        // Reset product type when subcategory changes
        if (
            selectedProductType &&
            !productTypes.includes(selectedProductType)
        ) {
            selectedProductType = null;
        }
    }

    // Pre-select current subcategory ONLY when dialog first opens
    $: if (isOpen && selectedCategory && !selectedSubcategory) {
        selectedSubcategory = product.subcategory;
        selectedProductType = product.product_type || product.subcategory;
    }

    function handleSubmit() {
        dispatch("submit", {
            product: product,
            currentCategory: {
                category: product.category,
                subcategory: product.subcategory,
                product_type: product.product_type || product.subcategory,
            },
            suggestedCategory: {
                category: selectedCategory,
                subcategory: selectedSubcategory,
                product_type: selectedProductType || selectedSubcategory,
            },
            notes: notes,
            timestamp: new Date().toISOString(),
        });

        isOpen = false;
        notes = "";
    }

    function handleClose() {
        isOpen = false;
        notes = "";
    }

    function handleIncorrectReport() {
        fetch("http://localhost:3000/api/report-incorrect-category", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                product: product,
                currentCategory: {
                    category: product.category,
                    subcategory: product.subcategory,
                    product_type: product.product_type || product.subcategory,
                },
                timestamp: new Date().toISOString(),
            }),
        })
            .then((response) => {
                if (response.ok) {
                    alert("Report submitted successfully");
                } else {
                    throw new Error("Failed to submit report");
                }
            })
            .catch((error) => {
                console.error("Error submitting report:", error);
                alert("Error submitting report");
            });

        isOpen = false;
    }
</script>

{#if isOpen}
    <div
        class="overlay"
        on:click|self={handleClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
    >
        <div class="dialog-content">
            <div class="dialog-header">
                <h2 id="dialog-title">Report Incorrect Category</h2>
                <button
                    class="btn btn-icon btn-icon-primary btn-icon-sm"
                    on:click={handleClose}
                    aria-label="Close dialog"
                >
                    <X size={20} />
                </button>
            </div>

            <div class="dialog-body">
                <div class="product-info-card">
                    <p><strong>Product:</strong> {product.name}</p>
                    <p>
                        <strong>Current Category:</strong>
                        {product.category} → {product.subcategory} → {product.product_type ||
                            product.subcategory}
                    </p>

                    {#if product.image_url}
                        <img
                            src={product.image_url}
                            alt={product.name}
                            class="product-image"
                        />
                    {:else}
                        <div class="product-image-placeholder">
                            <p>No image available</p>
                            <p class="placeholder-product-name">
                                {product.name}
                            </p>
                        </div>
                    {/if}
                </div>

                <div class="form-container">
                    <div class="form-group">
                        <label for="category-select">Suggested Category:</label>
                        <select
                            id="category-select"
                            bind:value={selectedCategory}
                            class="form-select"
                        >
                            {#each mainCategories as category}
                                <option value={category.name}
                                    >{category.name}</option
                                >
                            {/each}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="subcategory-select"
                            >Suggested Subcategory:</label
                        >
                        <select
                            id="subcategory-select"
                            bind:value={selectedSubcategory}
                            class="form-select"
                        >
                            {#each subcategories as subcategory}
                                <option value={subcategory.name}
                                    >{subcategory.name}</option
                                >
                            {/each}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="productType-select"
                            >Suggested Product Type:</label
                        >
                        <select
                            id="productType-select"
                            bind:value={selectedProductType}
                            class="form-select"
                            disabled={!selectedSubcategory ||
                                subcategories.find(
                                    (s) => s.name === selectedSubcategory,
                                )?.gridOnly}
                        >
                            {#if subcategories.find((s) => s.name === selectedSubcategory)?.gridOnly}
                                <option value={selectedSubcategory}
                                    >{selectedSubcategory}</option
                                >
                            {:else if productTypes && productTypes.length > 0}
                                {#each productTypes as type}
                                    <option value={type}>{type}</option>
                                {/each}
                            {/if}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="notes-area">Notes (optional):</label>
                        <textarea
                            id="notes-area"
                            bind:value={notes}
                            class="form-textarea"
                            placeholder="Why should this product be in a different category?"
                        ></textarea>
                    </div>
                </div>
            </div>

            <div class="dialog-actions">
                <button class="btn btn-secondary btn-md" on:click={handleClose}
                    >Cancel</button
                >
                <button
                    class="btn btn-danger btn-md"
                    on:click={handleIncorrectReport}
                >
                    Report as Incorrect
                </button>
                <button
                    class="btn btn-primary btn-md"
                    on:click={handleSubmit}
                    disabled={!selectedCategory || !selectedSubcategory}
                >
                    Submit Report
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--overlay-dark);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: var(--z-index-modal);
        padding: var(--spacing-md);
        animation: fadeIn var(--fade-in-duration) ease forwards;
    }

    .dialog-content {
        background-color: var(--background);
        padding: 0;
        border-radius: var(--card-border-radius);
        width: 100%;
        max-width: 550px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-medium);
        overflow: hidden; /* Prevents content from spilling out before scroll */
        animation: scaleIn var(--transition-normal) ease forwards;
    }

    .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--spacing-md) var(--spacing-lg);
        border-bottom: var(--border-width-thin) solid var(--border);
        background-color: var(--surface);
        min-height: var(--component-header-height);
        box-sizing: border-box;
    }

    .dialog-header h2 {
        margin: 0;
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
    }

    .dialog-body {
        padding: var(--spacing-lg);
        overflow-y: auto;
        flex-grow: 1;
    }

    .product-info-card {
        background-color: var(--surface);
        padding: var(--spacing-md);
        border-radius: var(--card-border-radius);
        margin-bottom: var(--spacing-lg);
        border: var(--border-width-thin) solid var(--border-lighter);
    }

    .product-info-card p {
        margin: 0 0 var(--spacing-xs) 0;
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
    }
    .product-info-card p strong {
        color: var(--text-primary);
        font-weight: var(--font-weight-semibold);
    }

    .product-image {
        max-width: 150px;
        max-height: 150px;
        width: auto;
        height: auto;
        object-fit: contain;
        margin-top: var(--spacing-sm);
        border-radius: var(--card-border-radius);
        background-color: var(--background);
        padding: var(--spacing-xs);
        border: var(--border-width-thin) solid var(--border);
    }

    .product-image-placeholder {
        width: 150px;
        height: 150px;
        background-color: var(--surface-hover);
        border: var(--border-width-thin) dashed var(--border);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: var(--spacing-sm);
        margin-top: var(--spacing-sm);
        text-align: center;
        border-radius: var(--card-border-radius);
        color: var(--text-secondary);
        font-size: var(--font-size-sm);
    }

    .placeholder-product-name {
        font-weight: var(--font-weight-semibold);
        margin-top: var(--spacing-xs);
        color: var(--text-primary);
    }

    .form-container {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
    }

    .form-group {
        display: flex;
        flex-direction: column;
    }

    .form-group label {
        margin-bottom: var(--spacing-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--text-primary);
        font-size: var(--font-size-sm);
    }

    .form-select,
    .form-textarea {
        width: 100%;
        padding: var(--spacing-sm);
        border: var(--border-width-thin) solid var(--border);
        border-radius: var(
            --card-border-radius
        ); /* Consistent with cards, less round than buttons */
        background-color: var(--background);
        color: var(--text-primary);
        font-size: var(--font-size-md);
        box-sizing: border-box;
        transition: var(--btn-transition);
        height: var(--btn-height-md); /* For select */
    }
    .form-select {
        appearance: none; /* For custom arrow if desired */
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666666'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right var(--spacing-sm) center;
        background-size: 1.2em;
        padding-right: calc(
            var(--spacing-sm) + 1.5em
        ); /* Make space for arrow */
    }

    .form-textarea {
        min-height: 100px;
        resize: vertical;
        height: auto; /* Overrides fixed height for textarea */
    }

    .form-select:focus,
    .form-textarea:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 2px rgba(0, 175, 185, 0.2); /* var(--primary) as rgba */
    }

    .form-select:disabled {
        background-color: var(--surface-hover);
        cursor: not-allowed;
        opacity: 0.7;
    }

    .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--spacing-sm);
        padding: var(--spacing-md) var(--spacing-lg);
        border-top: var(--border-width-thin) solid var(--border);
        background-color: var(--surface);
    }

    /* Custom danger button style */
    .btn-danger {
        background: var(--error);
        color: var(--button-text);
        border: none;
        border-radius: var(--btn-border-radius);
        box-shadow: var(--shadow-button);
    }

    .btn-danger:hover {
        background: #a02424; /* Darker error color */
        box-shadow: var(--shadow-medium);
        transform: translateY(var(--hover-lift));
    }

    .btn-danger:disabled {
        background: #e57373; /* Lighter disabled error color */
        opacity: 0.5;
    }
</style>
