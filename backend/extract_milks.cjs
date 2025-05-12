const fs = require('fs');
const path = require('path');

/**
 * Extracts products related to "Almond Milk" from a JSON file.
 * @param {string} inputFile Path to the input JSON file containing an array of products.
 * @param {string} outputFile Path where the filtered almond milk products will be saved.
 */
function extractAlmondMilkProducts(inputFile, outputFile) {
    // Check if the input file exists
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: Input file not found at ${inputFile}`);
        process.exit(1); // Exit the script with an error code
    }

    console.log(`Reading products from: ${inputFile}`);
    let allProducts;
    try {
        // Read and parse the JSON file
        const fileContent = fs.readFileSync(inputFile, 'utf8');
        allProducts = JSON.parse(fileContent);
    } catch (error) {
        console.error(`Error parsing JSON from ${inputFile}:`, error.message);
        process.exit(1);
    }

    // Ensure the parsed data is an array
    if (!Array.isArray(allProducts)) {
        console.error(`Error: Expected an array of products in ${inputFile}, but got ${typeof allProducts}.`);
        process.exit(1);
    }
    console.log(`Loaded ${allProducts.length} total products.`);

    // Filter products to find those related to Almond Milk
    const almondMilkProducts = allProducts.filter(product => {
        // Ensure the product is an object
        if (typeof product !== 'object' || product === null) {
            return false;
        }

        // Get relevant fields, converting to lowercase for case-insensitive search.
        // Use String() to handle cases where a field might not be a string.
        // Default to an empty string if the field doesn't exist.
        const productName = product.name ? String(product.name).toLowerCase() : '';
        const productDescription = product.description ? String(product.description).toLowerCase() : '';
        const productType = product.product_type ? String(product.product_type).toLowerCase() : ''; // If you have this field
        // You can add other fields if relevant, e.g., product.category, product.ingredients

        // Keywords to identify almond milk. Add more variations if needed.
        const keywords = ['almond milk', 'almondmilk'];

        // Check if any keyword is present in the relevant fields
        // 1. Check product_type (if it exists and is reliable)
        if (productType && keywords.some(keyword => productType.includes(keyword))) {
            return true;
        }
        // 2. Check product name
        if (productName && keywords.some(keyword => productName.includes(keyword))) {
            return true;
        }
        // 3. Check product description
        if (productDescription && keywords.some(keyword => productDescription.includes(keyword))) {
            return true;
        }

        // If none of the conditions are met, it's not an almond milk product
        return false;
    });

    console.log(`Found ${almondMilkProducts.length} products potentially related to "Almond Milk".`);

    // Save the filtered products to the output file
    if (almondMilkProducts.length > 0) {
        try {
            fs.writeFileSync(outputFile, JSON.stringify(almondMilkProducts, null, 2));
            console.log(`Almond Milk related products saved to: ${outputFile}`);
        } catch (error) {
            console.error(`Error writing to output file ${outputFile}:`, error.message);
        }
    } else {
        console.log('No Almond Milk related products found to save.');
    }
}

// --- Configuration ---
// Adjust these paths to your actual file locations
const INPUT_PRODUCT_FILE = '../product-categorization/categorized_products_sorted.json'; // Path to your input JSON file
const OUTPUT_ALMOND_MILK_FILE = './output/almond_milk_products.json'; // Path to save the filtered almond milk products
// ---------------------

// Ensure the output directory exists, create it if it doesn't
const outputDir = path.dirname(OUTPUT_ALMOND_MILK_FILE);
if (!fs.existsSync(outputDir)) {
    try {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`Created output directory: ${outputDir}`);
    } catch (error) {
        console.error(`Error creating output directory ${outputDir}:`, error.message);
        // Depending on desired behavior, you might want to exit here if directory creation fails
    }
}

// Run the extraction function
extractAlmondMilkProducts(INPUT_PRODUCT_FILE, OUTPUT_ALMOND_MILK_FILE);