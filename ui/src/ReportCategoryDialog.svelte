<script>
    import { createEventDispatcher } from "svelte";
    import { mainCategories } from "./categoryData";

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
    <div class="overlay">
        <div class="dialog">
            <h2>Report Incorrect Category</h2>
            <div class="product-info">
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
                        class="product-img"
                    />
                {:else}
                    <div class="no-image">
                        <p>No image available for this product</p>
                        <p class="product-name">
                            {product.name}
                        </p>
                    </div>
                {/if}
            </div>

            <div class="form">
                <div class="form-group">
                    <label for="category">Suggested Category:</label>
                    <select id="category" bind:value={selectedCategory}>
                        {#each mainCategories as category}
                            <option value={category.name}
                                >{category.name}</option
                            >
                        {/each}
                    </select>
                </div>

                <div class="form-group">
                    <label for="subcategory">Suggested Subcategory:</label>
                    <select id="subcategory" bind:value={selectedSubcategory}>
                        {#each subcategories as subcategory}
                            <option value={subcategory.name}
                                >{subcategory.name}</option
                            >
                        {/each}
                    </select>
                </div>

                <div class="form-group">
                    <label for="productType">Suggested Product Type:</label>
                    <select
                        id="productType"
                        bind:value={selectedProductType}
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
                    <label for="notes">Notes (optional):</label>
                    <textarea
                        id="notes"
                        bind:value={notes}
                        placeholder="Why should this product be in a different category?"
                    ></textarea>
                </div>

                <div class="button-group">
                    <button class="cancel-btn" on:click={handleClose}
                        >Cancel</button
                    >
                    <button
                        class="submit-btn"
                        on:click={handleSubmit}
                        disabled={!selectedCategory || !selectedSubcategory}
                    >
                        Submit Report
                    </button>
                    <button
                        class="incorrect-btn"
                        on:click={handleIncorrectReport}
                    >
                        Report as Incorrect
                    </button>
                </div>
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
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .dialog {
        background-color: white;
        padding: 20px;
        border-radius: 8px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
    }

    h2 {
        margin-top: 0;
        color: #333;
    }

    .product-info {
        background-color: #f9f9f9;
        padding: 10px;
        border-radius: 4px;
        margin-bottom: 15px;
    }

    .form-group {
        margin-bottom: 15px;
    }

    label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
    }

    select,
    textarea {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
    }

    textarea {
        min-height: 80px;
        resize: vertical;
    }

    .button-group {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    }

    .cancel-btn {
        padding: 8px 16px;
        background-color: #f1f1f1;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .submit-btn {
        padding: 8px 16px;
        background-color: #4caf50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .submit-btn:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
    }

    .product-img {
        max-width: 200px;
        max-height: 200px;
        object-fit: contain;
        margin-top: 10px;
    }

    .no-image {
        width: 200px;
        height: 200px;
        background-color: #f0f0f0;
        border: 1px dashed #ccc;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 10px;
        margin-top: 10px;
        text-align: center;
    }

    .no-image .product-name {
        font-weight: bold;
        margin-top: 10px;
        font-size: 14px;
        color: #666;
    }

    .incorrect-btn {
        padding: 8px 16px;
        background-color: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
</style>
