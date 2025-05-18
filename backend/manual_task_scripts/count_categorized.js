import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // ADD THIS IMPORT

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url); // ADD THIS LINE
const __dirname = path.dirname(__filename);       // ADD THIS LINE

// Now __dirname can be used correctly
const CATEGORIZED_PRODUCTS_PATH = path.join(__dirname, '../product-categorization/categorized_products.json');


function countProducts() {
    if (!fs.existsSync(CATEGORIZED_PRODUCTS_PATH)) {
        console.log(`File not found: ${CATEGORIZED_PRODUCTS_PATH}`);
        console.log('Count: 0');
        return;
    }

    try {
        const fileContent = fs.readFileSync(CATEGORIZED_PRODUCTS_PATH, 'utf8');
        if (!fileContent.trim()) {
            console.log(`File is empty: ${CATEGORIZED_PRODUCTS_PATH}`);
            console.log('Count: 0');
            return;
        }

        const products = JSON.parse(fileContent);

        if (!Array.isArray(products)) {
            console.error('Error: The file does not contain a valid JSON array.');
            return;
        }

        const productIds = new Set();
        let productsWithId = 0;
        let productsWithoutId = 0;

        for (const product of products) {
            // The structure in categorized_products.json is the raw output from api_categorizer.js
            // It should have a `productId` property directly on the objects in the array.
            if (product && typeof product === 'object' && product.productId) {
                productIds.add(product.productId);
                productsWithId++;
            } else if (product && typeof product === 'object') {
                productsWithoutId++;
            }
        }

        console.log(`Total objects in file: ${products.length}`);
        console.log(`Products with a productId: ${productsWithId}`);
        console.log(`Unique productIds: ${productIds.size}`);
        if (productsWithoutId > 0) {
            console.log(`Objects without a productId: ${productsWithoutId}`);
        }

    } catch (error) {
        console.error(`Error processing file ${CATEGORIZED_PRODUCTS_PATH}:`, error);
    }
}

countProducts();