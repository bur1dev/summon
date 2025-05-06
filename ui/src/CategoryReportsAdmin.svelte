<script>
    import { onMount } from "svelte";
    import { mainCategories } from "./categoryData";
    import { getContext } from "svelte";

    // This must be at the top level
    const { getStore } = getContext("store");
    let store = getStore();

    export let onClose = () => {};

    let reports = [];
    let loading = true;
    let error = null;
    let selectedReport = null;
    let showApproveDialog = false;
    let rebuildingIndex = false;
    let convertingFailures = false;
    let convertedCount = 0;

    let approvingAll = false;
    let approvedCount = 0;
    let totalToApprove = 0;

    // Category selection variables (added for system-detected failures)
    let selectedCategory = null;
    let selectedSubcategory = null;
    let selectedProductType = null;
    let subcategories = [];
    let productTypes = [];

    onMount(async () => {
        await loadReports();
    });

    async function loadReports() {
        try {
            loading = true;
            const response = await fetch(
                "http://localhost:3000/api/category-reports",
            );
            if (response.ok) {
                reports = await response.json();
            } else {
                error = "Failed to load reports";
            }
        } catch (err) {
            error = err.message;
        } finally {
            loading = false;
        }
    }

    function viewReport(report) {
        selectedReport = report;
        showApproveDialog = true;

        // For negative examples, just show the current category
        if (report.type === "negative_example") {
            // No need to set category variables for negative examples
        }
        // Initialize category variables if this is a system-detected failure
        else if (report.source === "system" || !report.suggestedCategory) {
            selectedCategory = report.currentCategory.category;
            selectedSubcategory = null;
            selectedProductType = null;
        } else {
            // For user reports, use the suggested category
            selectedCategory = report.suggestedCategory.category;
            selectedSubcategory = report.suggestedCategory.subcategory;
            selectedProductType = report.suggestedCategory.product_type;
        }
    }

    // Reactive statements for category selection (similar to ReportCategoryDialog)
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
        const subcategory = subcategories.find(
            (s) => s.name === selectedSubcategory,
        );
        productTypes = subcategory?.productTypes || [];

        // Check if this is a gridOnly subcategory
        if (subcategory?.gridOnly) {
            // For gridOnly subcategories, set product_type to subcategory name
            selectedProductType = selectedSubcategory;
        }
        // Otherwise reset product type when subcategory changes if it's not in the available options
        else if (
            selectedProductType &&
            !productTypes.includes(selectedProductType)
        ) {
            selectedProductType = null;
        }
    }

    async function approveReport() {
        try {
            console.log("Approving report with ID:", selectedReport.id);

            // For system-detected failures, ensure user has selected categories
            if (
                (selectedReport.source === "system" ||
                    !selectedReport.suggestedCategory) &&
                (!selectedCategory || !selectedSubcategory)
            ) {
                error = "Please select a category and subcategory";
                return;
            }

            // Update the suggestedCategory if this is a system-detected failure
            if (
                selectedReport.source === "system" ||
                !selectedReport.suggestedCategory
            ) {
                // For gridOnly subcategories, set product_type to subcategory name
                const isGridOnly = subcategories.find(
                    (s) => s.name === selectedSubcategory,
                )?.gridOnly;
                const effectiveProductType = isGridOnly
                    ? selectedSubcategory
                    : selectedProductType;

                const updatedCategory = {
                    category: selectedCategory,
                    subcategory: selectedSubcategory,
                    product_type: effectiveProductType,
                };

                selectedReport.suggestedCategory = updatedCategory;

                // First update the report in the file before approval
                console.log(
                    "Updating report before approval:",
                    updatedCategory,
                );
                const updateResponse = await fetch(
                    "http://localhost:3000/api/update-report-category",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            reportId: selectedReport.id,
                            suggestedCategory: updatedCategory,
                        }),
                    },
                );

                if (!updateResponse.ok) {
                    const updateText = await updateResponse.text();
                    throw new Error(`Failed to update report: ${updateText}`);
                }
            }

            // Now approve the report
            const response = await fetch(
                "http://localhost:3000/api/approve-category-report",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        reportId: selectedReport.id,
                        approve: true,
                    }),
                },
            );

            const responseText = await response.text();
            console.log("API response:", response.status, responseText);

            if (response.ok) {
                // Update UI
                const index = reports.findIndex(
                    (r) => r.id === selectedReport.id,
                );
                if (index !== -1) {
                    reports[index].status = "approved";
                    reports[index].suggestedCategory =
                        selectedReport.suggestedCategory;
                    reports = [...reports]; // Trigger Svelte reactivity
                }

                // ADDED: Recategorize the product in Holochain
                console.log(
                    "Report approved, checking product for recategorization",
                    selectedReport,
                );
                // In the approveReport function in CategoryReportsAdmin.svelte:
                if (selectedReport.product && selectedReport.product.hash) {
                    try {
                        console.log(
                            "Found product hash:",
                            selectedReport.product.hash,
                        );

                        // Convert object back to Uint8Array
                        const hashArray = new Uint8Array(
                            Object.values(selectedReport.product.hash),
                        );
                        console.log("Converted hash to Uint8Array:", hashArray);

                        const recatResult = await store.service.client.callZome(
                            {
                                role_name: "grocery",
                                zome_name: "products",
                                fn_name: "recategorize_product",
                                payload: {
                                    product_hash: hashArray,
                                    new_category:
                                        selectedReport.suggestedCategory
                                            .category,
                                    new_subcategory:
                                        selectedReport.suggestedCategory
                                            .subcategory,
                                    new_product_type:
                                        selectedReport.suggestedCategory
                                            .product_type,
                                },
                            },
                        );

                        console.log(
                            "Recategorization successful:",
                            recatResult,
                        );
                    } catch (recatErr) {
                        console.error(
                            "Failed to recategorize product:",
                            recatErr,
                        );
                        error = `Report approved, but product recategorization failed: ${recatErr.message}`;
                    }
                } else {
                    console.warn(
                        "Product has no hash property:",
                        selectedReport.product,
                    );
                    // Check what properties are available
                    console.log(
                        "Available product properties:",
                        Object.keys(selectedReport.product || {}),
                    );
                }

                // Close dialog
                showApproveDialog = false;
                selectedReport = null;
            } else {
                error = `Failed to approve report: ${responseText}`;
            }
        } catch (err) {
            console.error("Error in approveReport:", err);
            error = err.message;
        }
    }

    async function approveAllReports() {
        try {
            // Filter reports that are pending and have a suggestedCategory
            const pendingReports = reports.filter(
                (r) =>
                    (!r.status || r.status === "pending") &&
                    r.suggestedCategory &&
                    r.source !== "system",
            );

            if (pendingReports.length === 0) {
                error = "No reports available for bulk approval.";
                return;
            }

            approvingAll = true;
            totalToApprove = pendingReports.length;
            approvedCount = 0;
            error = `Approving ${totalToApprove} reports...`;

            for (const report of pendingReports) {
                try {
                    // Approve the report
                    const response = await fetch(
                        "http://localhost:3000/api/approve-category-report",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                reportId: report.id,
                                approve: true,
                            }),
                        },
                    );

                    if (response.ok) {
                        // Update UI
                        const index = reports.findIndex(
                            (r) => r.id === report.id,
                        );
                        if (index !== -1) {
                            reports[index].status = "approved";
                            reports = [...reports]; // Trigger Svelte reactivity
                        }

                        // Recategorize the product in Holochain
                        if (report.product && report.product.hash) {
                            try {
                                // Convert object back to Uint8Array
                                const hashArray = new Uint8Array(
                                    Object.values(report.product.hash),
                                );

                                await store.service.client.callZome({
                                    role_name: "grocery",
                                    zome_name: "products",
                                    fn_name: "recategorize_product",
                                    payload: {
                                        product_hash: hashArray,
                                        new_category:
                                            report.suggestedCategory.category,
                                        new_subcategory:
                                            report.suggestedCategory
                                                .subcategory,
                                        new_product_type:
                                            report.suggestedCategory
                                                .product_type,
                                    },
                                });
                            } catch (recatErr) {
                                console.error(
                                    `Failed to recategorize product ${report.id}:`,
                                    recatErr,
                                );
                            }
                        }

                        approvedCount++;
                        error = `Approved ${approvedCount} of ${totalToApprove} reports...`;
                    }
                } catch (err) {
                    console.error(`Error approving report ${report.id}:`, err);
                    // Continue with next report
                }
            }

            error = `Successfully approved ${approvedCount} of ${totalToApprove} reports.`;
        } catch (err) {
            error = `Error in bulk approval: ${err.message}`;
        } finally {
            approvingAll = false;
        }
    }

    async function rejectReport() {
        try {
            const response = await fetch(
                "http://localhost:3000/api/approve-category-report",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        reportId: selectedReport.id,
                        approve: false,
                    }),
                },
            );

            if (response.ok) {
                // Update UI and close dialog
                const index = reports.findIndex(
                    (r) => r.id === selectedReport.id,
                );
                if (index !== -1) {
                    reports[index].status = "rejected";
                    reports = [...reports]; // Trigger Svelte reactivity
                }

                showApproveDialog = false;
                selectedReport = null;
            } else {
                error = "Failed to reject report";
            }
        } catch (err) {
            error = err.message;
        }
    }

    async function rebuildCategorizer() {
        try {
            rebuildingIndex = true;
            error = null;

            const response = await fetch(
                "http://localhost:3000/api/rebuild-categorizer",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                },
            );

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    // Show success message as a temporary error (it's not really an error)
                    error =
                        "Categorization index rebuilt successfully! Changes will apply to new categorizations.";
                } else {
                    error = "Failed to rebuild categorization index";
                }
            } else {
                error = "Failed to connect to rebuild endpoint";
            }
        } catch (err) {
            error = `Error rebuilding index: ${err.message}`;
        } finally {
            rebuildingIndex = false;
        }
    }

    async function convertFailedCategorizations() {
        try {
            convertingFailures = true;
            error = null;

            const response = await fetch(
                "http://localhost:3000/api/convert-failed-categorizations",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                },
            );

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    convertedCount = result.converted;
                    error = `Successfully converted ${result.converted} failed categorizations to reports.`;
                    // Reload reports to show the new ones
                    await loadReports();
                } else {
                    error = "Failed to convert failed categorizations";
                }
            } else {
                error = "Failed to connect to conversion endpoint";
            }
        } catch (err) {
            error = `Error converting failures: ${err.message}`;
        } finally {
            convertingFailures = false;
        }
    }

    function getStatusBadgeClass(status) {
        if (status === "approved") return "badge-success";
        if (status === "rejected") return "badge-danger";
        return "badge-pending";
    }

    function getSourceBadgeClass(source) {
        return source === "system" ? "badge-system" : "badge-user";
    }
</script>

<div class="admin-container">
    <div class="admin-header">
        <h1>Category Reports Admin</h1>
        <button class="close-btn" on:click={onClose}>✕</button>
    </div>

    <div class="admin-actions">
        <div class="action-group">
            <button
                class="rebuild-btn"
                on:click={rebuildCategorizer}
                disabled={rebuildingIndex}
            >
                {rebuildingIndex
                    ? "Rebuilding..."
                    : "Rebuild Categorization Index"}
            </button>
            <p class="hint">
                Refresh the categorizer with the latest approved corrections
            </p>
        </div>

        <div class="action-group">
            <button
                class="convert-btn"
                on:click={convertFailedCategorizations}
                disabled={convertingFailures}
            >
                {convertingFailures
                    ? "Converting..."
                    : "Import Failed Categorizations"}
            </button>
            <p class="hint">
                Import failed categorizations as system-detected reports
            </p>
        </div>

        <!-- Add this new action group for bulk approval -->
        <div class="action-group">
            <button
                class="approve-all-btn"
                on:click={approveAllReports}
                disabled={approvingAll}
            >
                {approvingAll
                    ? `Approving ${approvedCount}/${totalToApprove}...`
                    : "Approve All Reports"}
            </button>
            <p class="hint">
                Approve all pending reports with suggested categories
            </p>
        </div>
    </div>

    {#if error}
        <div
            class="error-message"
            style="margin-top: 15px; margin-left: 20px; margin-right: 20px;"
        >
            {error}
        </div>
    {/if}

    {#if loading}
        <div class="loading">Loading reports...</div>
    {:else if reports.length === 0}
        <div class="no-data">No category reports found.</div>
    {:else}
        <div class="table-container">
            <table class="reports-table">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Current Category</th>
                        <th>Suggested Category</th>
                        <th>Reported On</th>
                        <th>Status</th>
                        <th>Source</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each reports as report}
                        <tr
                            class={report.source === "system"
                                ? "system-row"
                                : ""}
                        >
                            <td>{report.product.name}</td>
                            <td>
                                {report.currentCategory.category} →
                                {report.currentCategory.subcategory} →
                                {report.currentCategory.product_type}
                            </td>
                            <td>
                                {#if report.type === "negative_example"}
                                    <span class="negative-example"
                                        >Incorrect Category Report</span
                                    >
                                {:else if report.suggestedCategory}
                                    {report.suggestedCategory.category} →
                                    {report.suggestedCategory.subcategory} →
                                    {report.suggestedCategory.product_type ||
                                        report.suggestedCategory.subcategory}
                                {:else}
                                    <span class="needs-review"
                                        >Needs Admin Review</span
                                    >
                                {/if}
                            </td>
                            <td
                                >{new Date(
                                    report.timestamp,
                                ).toLocaleString()}</td
                            >
                            <td>
                                <span
                                    class="badge {getStatusBadgeClass(
                                        report.status,
                                    )}"
                                >
                                    {report.status || "pending"}
                                </span>
                            </td>
                            <td>
                                <span
                                    class="badge {getSourceBadgeClass(
                                        report.source,
                                    )}"
                                >
                                    {report.source || "user"}
                                </span>
                            </td>
                            <td>
                                <button
                                    class="view-btn"
                                    on:click={() => viewReport(report)}
                                    disabled={report.status === "approved" ||
                                        report.status === "rejected"}
                                >
                                    Review
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

{#if showApproveDialog && selectedReport}
    <div class="overlay">
        <div class="dialog">
            <h2>Review Category Report</h2>

            <div class="report-details">
                <div class="report-section">
                    <h3>Product</h3>
                    <p><strong>Name:</strong> {selectedReport.product.name}</p>
                    <p>
                        <strong>Size:</strong>
                        {selectedReport.product.size || "Not specified"}
                    </p>
                    {#if selectedReport.product.image_url}
                        <img
                            src={selectedReport.product.image_url}
                            alt={selectedReport.product.name}
                            class="product-img"
                        />
                    {:else}
                        <div class="no-image">
                            <p>No image available for this product</p>
                            <p class="product-name">
                                {selectedReport.product.name}
                            </p>
                        </div>
                    {/if}
                </div>

                <div class="report-section">
                    <h3>Current Categorization</h3>
                    <ul>
                        <li>
                            <strong>Category:</strong>
                            {selectedReport.currentCategory.category}
                        </li>
                        <li>
                            <strong>Subcategory:</strong>
                            {selectedReport.currentCategory.subcategory}
                        </li>
                        <li>
                            <strong>Product Type:</strong>
                            {selectedReport.currentCategory.product_type}
                        </li>
                    </ul>
                </div>

                {#if selectedReport.source === "system" || !selectedReport.suggestedCategory}
                    <!-- System-detected failure or missing suggested category -->
                    <div class="report-section system-section">
                        <h3>Select Correct Category</h3>
                        <p class="system-note">
                            This report requires admin categorization
                        </p>

                        <div class="form-group">
                            <label for="category">Category:</label>
                            <select id="category" bind:value={selectedCategory}>
                                <option value={null}>Select Category</option>
                                {#each mainCategories as category}
                                    <option value={category.name}
                                        >{category.name}</option
                                    >
                                {/each}
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="subcategory">Subcategory:</label>
                            <select
                                id="subcategory"
                                bind:value={selectedSubcategory}
                                disabled={!selectedCategory}
                            >
                                <option value={null}>Select Subcategory</option>
                                {#each subcategories as subcategory}
                                    <option value={subcategory.name}
                                        >{subcategory.name}</option
                                    >
                                {/each}
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="productType">Product Type:</label>
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
                    </div>
                {:else}
                    <!-- User-suggested category -->
                    <div class="report-section">
                        <h3>Suggested Categorization</h3>
                        <ul>
                            <li>
                                <strong>Category:</strong>
                                {selectedReport.suggestedCategory.category}
                            </li>
                            <li>
                                <strong>Subcategory:</strong>
                                {selectedReport.suggestedCategory.subcategory}
                            </li>
                            <li>
                                <strong>Product Type:</strong>
                                {selectedReport.suggestedCategory.product_type}
                            </li>
                        </ul>
                    </div>
                {/if}

                {#if selectedReport.notes}
                    <div class="report-section">
                        <h3>Notes</h3>
                        <p>{selectedReport.notes}</p>
                    </div>
                {/if}

                <div class="action-buttons">
                    <button class="reject-btn" on:click={rejectReport}
                        >Reject</button
                    >
                    <button class="approve-btn" on:click={approveReport}
                        >Approve</button
                    >
                    <button
                        class="cancel-btn"
                        on:click={() => (showApproveDialog = false)}
                        >Cancel</button
                    >
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .admin-container {
        padding: 0;
        max-width: 1200px;
        margin: 0 auto;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        overflow-y: hidden;
    }

    .table-container {
        overflow-y: auto;
        max-height: calc(90vh - 200px);
        margin-top: 0px;
    }

    .admin-actions {
        margin: 0;
        padding: 15px 20px;
        background-color: #f8f9fa;
        border-radius: 0;
        display: flex;
        align-items: flex-start;
        gap: 40px;
        position: sticky;
        top: 45px;
        z-index: 9;
    }

    .action-group {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .rebuild-btn,
    .convert-btn {
        padding: 8px 16px;
        background-color: #6c757d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }

    .convert-btn {
        background-color: #28a745;
    }

    .rebuild-btn:hover:not(:disabled),
    .convert-btn:hover:not(:disabled) {
        opacity: 0.9;
    }

    .rebuild-btn:disabled,
    .convert-btn:disabled {
        background-color: #adb5bd;
        cursor: not-allowed;
    }

    .hint {
        color: #6c757d;
        font-size: 14px;
        margin: 0;
    }

    .error-message {
        background-color: #ffecec;
        color: #721c24;
        padding: 10px;
        border-radius: 4px;
        margin-bottom: 20px;
    }

    .reports-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
    }

    .reports-table th,
    .reports-table td {
        padding: 10px;
        border: 1px solid #ddd;
        text-align: left;
    }

    .reports-table th {
        background-color: #f5f5f5;
        font-weight: bold;
    }

    .reports-table thead {
        position: sticky;
        top: -2px;
        background-color: #f5f5f5;
        z-index: 5;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .reports-table tr:nth-child(even) {
        background-color: #f9f9f9;
    }

    .system-row {
        background-color: #f8f9ff !important;
    }

    .badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
    }

    .badge-pending {
        background-color: #ffeeba;
        color: #856404;
    }

    .badge-success {
        background-color: #d4edda;
        color: #155724;
    }

    .badge-danger {
        background-color: #f8d7da;
        color: #721c24;
    }

    .badge-system {
        background-color: #e2e3ff;
        color: #3f51b5;
    }

    .badge-user {
        background-color: #e7f5ff;
        color: #0d6efd;
    }

    .needs-review {
        color: #dc3545;
        font-weight: bold;
    }

    .view-btn {
        padding: 5px 10px;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .view-btn:disabled {
        background-color: #cccccc;
        cursor: not-allowed;
    }

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
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
    }

    .report-details {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .report-section {
        padding: 15px;
        background-color: #f9f9f9;
        border-radius: 4px;
    }

    .system-section {
        background-color: #f2f4ff;
        border-left: 4px solid #3f51b5;
    }

    .system-note {
        color: #3f51b5;
        font-style: italic;
        margin-bottom: 15px;
    }

    .form-group {
        margin-bottom: 15px;
    }

    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
    }

    .form-group select {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
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

    .action-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    }

    .approve-btn,
    .reject-btn,
    .cancel-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .approve-btn {
        background-color: #28a745;
        color: white;
    }

    .reject-btn {
        background-color: #dc3545;
        color: white;
    }

    .cancel-btn {
        background-color: #f1f1f1;
    }

    .admin-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 0;
        width: 100%;
        position: sticky;
        top: 0;
        background: white;
        z-index: 10;
        padding: 10px 20px 0 20px;
    }

    .admin-header h1 {
        margin: 0;
        padding: 0;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        padding: 5px 10px;
    }

    .close-btn:hover {
        background-color: #f1f1f1;
    }

    .negative-example {
        color: #dc3545;
        font-weight: bold;
    }

    .approve-all-btn {
        padding: 8px 16px;
        background-color: #28a745;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }

    .approve-all-btn:hover:not(:disabled) {
        opacity: 0.9;
    }

    .approve-all-btn:disabled {
        background-color: #adb5bd;
        cursor: not-allowed;
    }
</style>
