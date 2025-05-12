const fs = require('fs');
const path = require('path');

/**
 * Counts the number of unique product_type values from a JSON file
 * containing an array of product objects.
 * Each product object is expected to have a 'product_type' field.
 *
 * @param {string} filePath - The path to the JSON file.
 */
function countUniqueProductTypes(filePath) {
    try {
        // Check if the file exists
        if (!fs.existsSync(filePath)) {
            console.error(`\nError: File not found at path: ${filePath}`);
            console.error("Please ensure you have provided the correct path to your JSON product data file.");
            return;
        }

        // Read the JSON file content
        console.log(`\nReading file: ${filePath}...`);
        const fileContent = fs.readFileSync(filePath, 'utf8');

        // Parse the JSON data
        console.log("Parsing JSON data...");
        const productsArray = JSON.parse(fileContent);

        if (!Array.isArray(productsArray)) {
            console.error("\nError: The JSON file's root is not an array.");
            console.error("The script expects a JSON file structured as an array of product objects, like '[{...}, {...}, ...]'");
            return;
        }

        console.log(`Found ${productsArray.length} product entries in the file.`);

        const uniqueProductTypes = new Set();
        let productsWithProductTypeField = 0;
        let productsWithValidProductType = 0;

        productsArray.forEach((product, index) => {
            if (product && typeof product === 'object' && product.hasOwnProperty('product_type')) {
                productsWithProductTypeField++;
                const productType = product.product_type;

                if (typeof productType === 'string' && productType.trim() !== '') {
                    uniqueProductTypes.add(productType.trim()); // Trim to handle potential leading/trailing spaces
                    productsWithValidProductType++;
                } else {
                    // Log if product_type exists but is not a non-empty string (e.g., null, empty string, or other type)
                    console.warn(`Warning: Product at index ${index} (productId: ${product.productId || 'N/A'}) has an invalid or empty product_type: '${productType}'`);
                }
            } else if (product && typeof product === 'object' && !product.hasOwnProperty('product_type')) {
                console.warn(`Warning: Product at index ${index} (productId: ${product.productId || 'N/A'}) is missing the 'product_type' field.`);
            } else if (typeof product !== 'object' || product === null) {
                console.warn(`Warning: Item at index ${index} is not a valid product object: ${JSON.stringify(product)}`);
            }
        });

        console.log(`\n--- Summary ---`);
        console.log(`Total products processed: ${productsArray.length}`);
        console.log(`Products with a 'product_type' field: ${productsWithProductTypeField}`);
        console.log(`Products with a valid (non-empty string) 'product_type': ${productsWithValidProductType}`);
        console.log(`Number of unique product types found: ${uniqueProductTypes.size}`);

        // Optional: To list all unique product types found
        /*
        if (uniqueProductTypes.size > 0 && uniqueProductTypes.size < 50) { // Only print if not too many
            console.log("\nList of unique product types found:");
            let i = 1;
            for (const pt of uniqueProductTypes) {
                console.log(`${i++}. ${pt}`);
            }
        } else if (uniqueProductTypes.size >= 50) {
            console.log("\n(List of unique product types is too long to display here)");
        }
        */

    } catch (error) {
        console.error("\nAn error occurred while processing the file:");
        if (error instanceof SyntaxError) {
            console.error("JSON Parsing Error: The file content is not valid JSON.", error.message);
            console.error("Please ensure your JSON file is correctly formatted.");
        } else if (error.code === 'ENOENT') {
            // This case is already handled by the fs.existsSync check, but good for robustness
            console.error("File Not Found Error:", error.message);
        } else {
            console.error("Error:", error.message);
            console.error(error.stack);
        }
    }
}

// --- How to use the script ---
// 1. Save this code as a .js file (e.g., countProductDataTypes.js).
// 2. Ensure your full JSON product data (like the chunk you provided, but the complete file)
//    is saved as a .json file (e.g., product_data.json).
// 3. Open your terminal or command prompt.
// 4. Navigate to the directory where you saved this script and your JSON data file.
// 5. Run the script using Node.js, providing the path to your JSON data file as an argument:
//    node countProductDataTypes.js your_product_data_file.json
//    For example, if your data file is named "my_products.json":
//    node countProductDataTypes.js my_products.json

// Get the file path from command line arguments
const args = process.argv.slice(2); // process.argv[0] is node, process.argv[1] is the script file

if (args.length === 0) {
    console.log("\nPlease provide the path to your JSON product data file as a command line argument.");
    console.log("Example: node countProductDataTypes.js product_data.json");
    console.log("Or: node countProductDataTypes.js /path/to/your/product_data.json");
} else {
    const productDataFilePath = args[0];
    // path.resolve helps in correctly interpreting relative or absolute paths
    countUniqueProductTypes(path.resolve(productDataFilePath));
}