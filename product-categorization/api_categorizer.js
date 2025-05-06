const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const fetch = require('node-fetch');

class ProductCategorizer {
    constructor(apiKey) {
        console.log(`API Key loaded (first 4 chars): ${apiKey.substring(0, 4)}...`);
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
        this.correctionMap = this.loadCorrectionMap();

        // Process categories into minimal format
        const rawData = JSON.parse(fs.readFileSync(path.join(__dirname, 'categories.json'), 'utf8'));
        this.categoryData = this.processCategories(rawData);
    }

    loadCorrectionMap() {
        try {
            const mapFile = path.join(__dirname, 'correction_map.json');
            if (fs.existsSync(mapFile)) {
                return JSON.parse(fs.readFileSync(mapFile, 'utf8'));
            }
        } catch (err) {
            console.error('Error loading correction map:', err);
        }
        return {};
    }

    processCategories(categories) {
        return categories.map(cat => ({
            name: cat.name,
            subcategories: cat.subcategories.map(sub => ({
                name: sub.name,
                gridOnly: sub.gridOnly || false,
                productTypes: sub.productTypes || []
            }))
        }));
    }

    logFailedCategorization(product, error = null, attemptedCategory = null) {
        const failedFile = path.join(__dirname, 'failed_categorizations.jsonl');

        const logEntry = {
            description: product.description,
            error_message: error ? error.message : undefined,
            attempted_category: attemptedCategory || undefined,
            kroger_categories: product.categories || [],
            timestamp: new Date().toISOString()
        };

        // Remove undefined fields
        Object.keys(logEntry).forEach(key =>
            logEntry[key] === undefined && delete logEntry[key]
        );

        try {
            fs.appendFileSync(failedFile, JSON.stringify(logEntry) + '\n');
            console.error(`Logged failed categorization for: ${product.description}`);
        } catch (err) {
            console.error('Failed to log categorization failure:', err);
        }
    }

    async categorizeProducts(products, batchSize = 20) {
        // Smaller default batch size due to image data
        const results = [];
        const failedProducts = [];

        // First check correction map
        const knownProducts = [];
        const unknownProducts = [];

        for (const product of products) {
            const productKey = product.productId || product.description.toLowerCase();
            if (this.correctionMap[productKey]) {
                console.log(`Correction map match for: ${product.description}`);
                knownProducts.push({
                    ...product,
                    ...this.correctionMap[productKey]
                });
            } else {
                unknownProducts.push(product);
            }
        }

        results.push(...knownProducts);
        console.log(`Found ${knownProducts.length} products in correction map. Processing ${unknownProducts.length} unknown products.`);

        // Process unknown products in batches
        for (let i = 0; i < unknownProducts.length; i += batchSize) {
            const batch = unknownProducts.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(unknownProducts.length / batchSize)}, products ${i + 1}-${i + batch.length}`);

            try {
                const batchResults = await this.processBatchWithRetry(batch);
                results.push(...batchResults);

                // Longer delay due to image processing
                if (i + batchSize < unknownProducts.length) {
                    const delaySeconds = 30; // 30 second delay between batches
                    console.log(`Waiting ${delaySeconds} seconds before next batch...`);
                    await new Promise(r => setTimeout(r, delaySeconds * 1000));
                }
            } catch (error) {
                console.error(`Failed batch ${i + 1}-${i + batch.length} after retries`);
                failedProducts.push(...batch);
                this.logFailedProducts(batch);

                // Log each product in the failed batch
                batch.forEach(product => {
                    this.logFailedCategorization(product, error);
                });
            }
        }

        if (failedProducts.length > 0) {
            console.log(`Failed to categorize ${failedProducts.length} products. See failed_products.json and failed_categorizations.jsonl`);
        }

        return results;
    }

    logFailedProducts(products) {
        try {
            const failedFile = path.join(__dirname, 'failed_products.json');
            let failed = [];

            if (fs.existsSync(failedFile)) {
                failed = JSON.parse(fs.readFileSync(failedFile, 'utf8'));
            }

            failed.push(...products);
            fs.writeFileSync(failedFile, JSON.stringify(failed, null, 2));
        } catch (err) {
            console.error('Error logging failed products:', err);
        }
    }

    async processBatchWithRetry(products, maxRetries = 3) {
        let retries = 0;
        let lastError;

        // Split if too large
        if (products.length > 20) {
            const halfSize = Math.ceil(products.length / 2);
            const batch1 = await this.processBatchWithRetry(products.slice(0, halfSize));
            const batch2 = await this.processBatchWithRetry(products.slice(halfSize));
            return [...batch1, ...batch2];
        }

        while (retries < maxRetries) {
            try {
                return await this.processBatch(products);
            } catch (error) {
                lastError = error;
                retries++;
                const delay = retries * 60000; // 1min, 2min, 3min
                console.log(`Retry ${retries}/${maxRetries} after ${delay / 1000}s delay. Error: ${error.message}`);
                await new Promise(r => setTimeout(r, delay));
            }
        }

        throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message}`);
    }

    async prepareImageContent(imageUrl) {
        console.log(`Attempting to load image: ${imageUrl}`);
        try {
            if (!imageUrl || imageUrl.includes("null")) {
                console.warn(`❌ Invalid image URL: ${imageUrl}`);
                return null;
            }

            // Fetch image data
            const response = await fetch(imageUrl);
            if (!response.ok) {
                console.warn(`❌ Failed to fetch image: ${imageUrl} (${response.status})`);
                return null;
            }

            // Get image data as buffer
            const imageBuffer = await response.buffer();
            console.log(`✅ Successfully loaded image: ${imageUrl} (${imageBuffer.length} bytes)`);

            // Convert to base64
            const base64Data = imageBuffer.toString('base64');
            const mimeType = this.getMimeTypeFromUrl(imageUrl);
            console.log(`✅ Converted to base64 with MIME type: ${mimeType}`);

            return {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            };
        } catch (error) {
            console.error(`❌ Error processing image ${imageUrl}: ${error.message}`);
            return null;
        }
    }

    getMimeTypeFromUrl(url) {
        const extension = url.split('.').pop().toLowerCase();
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp'
        };
        return mimeTypes[extension] || 'image/jpeg';
    }

    async processBatch(products) {
        if (products.length === 0) return [];

        // Prepare multimodal content including images
        const contents = [];

        // First, extract image URLs properly
        for (let i = 0; i < products.length; i++) {
            const product = products[i];

            // Extract image URL properly from images array
            if (product.images && Array.isArray(product.images)) {
                const frontImage = product.images.find(img => img.perspective === "front");
                if (frontImage && frontImage.sizes) {
                    const largeSize = frontImage.sizes.find(size => size.size === "large");
                    product.image_url = largeSize?.url || null;
                    console.log(`Found image URL for product ${i + 1}: ${product.image_url}`);
                }
            }

            if (!product.image_url) {
                console.log(`No image URL found for product ${i + 1}: ${product.description}`);
            }
        }

        // Start with text instruction
        contents.push({
            role: "user",
            parts: [{ text: this.createPromptText(products) }]
        });

        // Add images for each product
        for (let i = 0; i < products.length; i++) {
            const product = products[i];

            if (product.image_url) {
                const imageContent = await this.prepareImageContent(product.image_url);
                if (imageContent) {
                    contents.push({
                        role: "user",
                        parts: [
                            { text: `Image for Product ${i + 1}: ${product.description}` },
                            imageContent
                        ]
                    });
                }
            }
        }

        console.log(`Sending to Gemini API: ${products.length} products, ${contents.length - 1} images`);
        if (contents.length <= 1) {
            console.log(`❌ WARNING: No valid images found in this batch!`);
            console.log(`Product URLs: ${products.map(p => p.image_url || 'NO_URL').join(', ')}`);
        }

        const result = await this.model.generateContent({
            contents,
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
            }
        });

        console.log("Received response from Gemini API");
        return this.parseResponse(result.response.text(), products);
    }

    createPromptText(products) {
        // Create detailed taxonomy with ALL product types listed
        const detailedTaxonomy = this.categoryData.map(cat => ({
            name: cat.name,
            subcategories: cat.subcategories.map(sub => ({
                name: sub.name,
                productTypes: sub.productTypes || []
            }))
        }));

        return `Categorize these grocery products. ONLY use exact categories, subcategories, and product types from the taxonomy below.
CRITICAL: Do not invent or create new categories or product types.

COMPLETE TAXONOMY:
${JSON.stringify(detailedTaxonomy, null, 1)}

PRODUCTS TO CATEGORIZE:
${products.map((p, i) => `
PRODUCT ${i + 1}:
- Description: ${p.description}
- Brand: ${p.brand || "Unknown"}
- Size: ${p.items?.[0]?.size || "Unknown"}
- Temperature: ${p.temperature?.indicator || "Unknown"}
`).join('\n')}

Return only a JSON array with each item having EXACTLY these field names:
- "category": one of the category names from the taxonomy
- "subcategory": one of the subcategory names (singular, NOT "subcategories" plural)
- "product_type": one of the product types from the taxonomy

Example of correct response format:
[
  {
    "category": "Produce",
    "subcategory": "Fresh Fruits",
    "product_type": "Apples"
  }
]

IMPORTANT: Use these exact field names shown above.`;
    }

    async parseResponse(text, products) {
        try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.error("No JSON found in response:", text);
                throw new Error("No JSON found in response");
            }

            let parsed;
            try {
                parsed = JSON.parse(jsonMatch[0]);
                console.log("Raw LLM categorization:", JSON.stringify(parsed, null, 2));
            } catch (jsonError) {
                console.error("JSON parsing error:", jsonError);
                throw new Error(`Invalid JSON format: ${jsonError.message}`);
            }

            // Ensure we have an array
            if (!Array.isArray(parsed)) {
                console.error("Parsed result is not an array:", parsed);
                throw new Error("Expected JSON array in response");
            }

            if (parsed.length !== products.length) {
                console.warn(`Warning: Response has ${parsed.length} items, but expected ${products.length}. Filling missing items.`);

                while (parsed.length < products.length) {
                    const missingIndex = parsed.length;
                    const missingProduct = products[missingIndex];

                    parsed.push({
                        category: "Uncategorized",
                        subcategory: "Unknown",
                        product_type: "Unknown"
                    });

                    // Log this as a failure
                    this.logFailedCategorization(missingProduct, new Error("Missing from API response"));
                }
            }

            // Normalize field names
            parsed = parsed.map(item => {
                let normalizedSubcategory;

                if (item.subcategory) {
                    normalizedSubcategory = item.subcategory;
                } else if (item.subcategories) {
                    if (typeof item.subcategories === 'string') {
                        normalizedSubcategory = item.subcategories;
                    } else if (Array.isArray(item.subcategories) && item.subcategories.length > 0) {
                        normalizedSubcategory = item.subcategories[0];
                        console.warn(`Converted subcategories array to string: ${normalizedSubcategory}`);
                    } else {
                        normalizedSubcategory = "Unknown";
                        console.warn(`Invalid subcategories value: ${JSON.stringify(item.subcategories)}`);
                    }
                } else {
                    normalizedSubcategory = "Unknown";
                    console.warn(`No subcategory found in item: ${JSON.stringify(item)}`);
                }

                return {
                    category: item.category || "Uncategorized",
                    subcategory: normalizedSubcategory,
                    product_type: item.product_type || "Unknown"
                };
            });

            console.log("Normalized JSON:", JSON.stringify(parsed, null, 2));

            // Validate each result against the taxonomy
            const categorizedProducts = parsed.map((result, i) => {
                const product = products[i];
                try {
                    const validResult = this.validateCategorization(result, product);
                    return {
                        ...product,
                        category: validResult.category,
                        subcategory: validResult.subcategory,
                        product_type: validResult.product_type
                    };
                } catch (error) {
                    console.error(`Validation error for product: ${product.description}`, error);
                    this.logFailedCategorization(product, error, result);

                    return {
                        ...product,
                        category: "Uncategorized",
                        subcategory: "Unknown",
                        product_type: "Unknown"
                    };
                }
            });

            return await this.applyDualCategorization(categorizedProducts);
        } catch (error) {
            console.error("Error parsing API response:", error);

            // Log failure for all products in this batch
            products.forEach(product => {
                this.logFailedCategorization(product, error);
            });

            throw error;
        }
    }

    validateCategorization(result, product) {
        const category = result.category;
        const subcategory = result.subcategory;
        const productType = result.product_type;

        // Find the category in our taxonomy
        const categoryObj = this.categoryData.find(c => c.name === category);
        if (!categoryObj) {
            console.warn(`Invalid category "${category}" for product "${product.description}".`);
            // Log this as a failure
            this.logFailedCategorization(product, new Error(`Invalid category: ${category}`), result);

            // Use first category from taxonomy
            const firstCategory = this.categoryData[0];
            return {
                category: firstCategory.name,
                subcategory: firstCategory.subcategories[0].name,
                product_type: firstCategory.subcategories[0].productTypes[0] || firstCategory.subcategories[0].name
            };
        }

        // Find the subcategory
        const subcategoryObj = categoryObj.subcategories.find(s => s.name === subcategory);
        if (!subcategoryObj) {
            console.warn(`Invalid subcategory "${subcategory}" for product "${product.description}".`);
            // Log this as a failure
            this.logFailedCategorization(product, new Error(`Invalid subcategory: ${subcategory}`), result);

            return {
                category: category,
                subcategory: categoryObj.subcategories[0].name,
                product_type: categoryObj.subcategories[0].productTypes[0] || categoryObj.subcategories[0].name
            };
        }

        // For gridOnly subcategories, product_type should match subcategory name
        if (subcategoryObj.gridOnly || !subcategoryObj.productTypes || subcategoryObj.productTypes.length === 0) {
            // Replace "Unknown" with subcategory name for gridOnly
            if (productType === "Unknown") {
                return { category, subcategory, product_type: subcategory };
            }
            return { category, subcategory, product_type: subcategory };
        }

        // Check if product_type is valid
        if (!subcategoryObj.productTypes.includes(productType)) {
            console.warn(`Invalid product_type "${productType}" for "${category}" → "${subcategory}".`);
            // Log this as a failure
            this.logFailedCategorization(product, new Error(`Invalid product_type: ${productType}`), result);

            return {
                category,
                subcategory,
                product_type: subcategoryObj.productTypes[0]
            };
        }

        // All valid
        return { category, subcategory, product_type: productType };
    }

    async applyDualCategorization(products) {
        console.log('🚀 Starting dual categorization process...');
        try {
            const inputJson = JSON.stringify(products);
            const result = execSync('python3 dual_bridge.py', {
                input: inputJson,
                encoding: 'utf-8',
                cwd: __dirname,
                maxBuffer: 10 * 1024 * 1024
            });

            const dualProducts = JSON.parse(result);
            console.log(`📦 Received ${dualProducts.length} products from dual bridge`);

            // Separate products by whether they need LLM
            const needsLLM = [];
            const directMapped = [];

            for (const product of dualProducts) {
                if (product.additional_categorizations && product.additional_categorizations.length > 0) {
                    let needsAnyLLM = false;

                    for (const cat of product.additional_categorizations) {
                        if (!cat.product_type) {
                            needsAnyLLM = true;
                            break;
                        }
                    }

                    if (needsAnyLLM) {
                        console.log(`🤖 LLM needed for: ${product.description}`);
                        needsLLM.push(product);
                    } else {
                        console.log(`✨ Direct mapping found for: ${product.description}`);
                        directMapped.push(product);
                    }
                }
            }

            console.log(`📊 Summary: ${directMapped.length} direct mapped, ${needsLLM.length} need LLM`);

            // Process products that need LLM in batches
            if (needsLLM.length > 0) {
                await this.batchDetermineProductTypes(needsLLM);
            }

            console.log(`✅ Dual categorization complete!`);
            return dualProducts;
        } catch (error) {
            console.error('❌ Dual categorization bridge error:', error);

            // Log failure for all products
            products.forEach(product => {
                this.logFailedCategorization(product, error, {
                    error: 'dual_bridge_failed'
                });
            });

            // Return products without dual categorization
            return products;
        }
    }

    async batchDetermineProductTypes(products) {
        console.log(`🔄 Batching product type determination for ${products.length} products`);

        // Collect all product-category combinations that need processing
        const batchItems = [];

        for (const product of products) {
            for (let i = 0; i < product.additional_categorizations.length; i++) {
                const cat = product.additional_categorizations[i];
                if (!cat.product_type) {
                    // Get available product types for this category/subcategory
                    let availableProductTypes = [];
                    for (const categoryData of this.categoryData) {
                        if (categoryData.name === cat.main_category) {
                            for (const subcat of categoryData.subcategories) {
                                if (subcat.name === cat.subcategory) {
                                    if (subcat.gridOnly || !subcat.productTypes || subcat.productTypes.length === 0) {
                                        // For gridOnly, the product type is the subcategory itself
                                        cat.product_type = cat.subcategory;
                                        break;
                                    }
                                    availableProductTypes = subcat.productTypes;
                                    break;
                                }
                            }
                            break;
                        }
                    }

                    // Only add to batch if we have product types to choose from
                    if (availableProductTypes.length > 0) {
                        batchItems.push({
                            id: `product_${products.indexOf(product)}_cat_${i}`,
                            productIndex: products.indexOf(product),
                            categorizationIndex: i,
                            description: product.description,
                            category: cat.main_category,
                            subcategory: cat.subcategory,
                            availableProductTypes: availableProductTypes
                        });
                    }
                }
            }
        }

        if (batchItems.length === 0) {
            console.log('No items need product type determination');
            return;
        }

        console.log(`Processing ${batchItems.length} product-category combinations in batches...`);

        // Process in batches of 20
        const BATCH_SIZE = 20;
        for (let i = 0; i < batchItems.length; i += BATCH_SIZE) {
            const chunk = batchItems.slice(i, Math.min(i + BATCH_SIZE, batchItems.length));
            console.log(`Processing chunk ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(batchItems.length / BATCH_SIZE)} (${chunk.length} items)`);

            try {
                await this.processBatchChunk(chunk, products);

                // Add delay between chunks if not the last chunk
                if (i + BATCH_SIZE < batchItems.length) {
                    console.log('Waiting 2 seconds before next chunk...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.error(`Error processing chunk ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
                // Apply fallback for all items in this chunk
                for (const item of chunk) {
                    const fallbackType = item.availableProductTypes[0];
                    products[item.productIndex].additional_categorizations[item.categorizationIndex].product_type = fallbackType;
                    console.warn(`❌ Using fallback for ${item.description}: ${fallbackType}`);
                }
            }
        }
    }

    async processBatchChunk(chunk, products) {
        // Create batch prompt
        const batchPrompt = this.createBatchProductTypePrompt(chunk);

        const result = await this.model.generateContent({
            contents: [{ role: "user", parts: [{ text: batchPrompt }] }],
            generationConfig: { temperature: 0.1 }
        });

        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error('No JSON array found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Create a map for faster lookup
        const responseMap = new Map();
        for (const response of parsed) {
            if (response.id) {
                responseMap.set(response.id, response);
            }
        }

        // Apply the product types back to the original products
        for (const item of chunk) {
            const response = responseMap.get(item.id);

            if (response && response.product_type && item.availableProductTypes.includes(response.product_type)) {
                products[item.productIndex].additional_categorizations[item.categorizationIndex].product_type = response.product_type;
                console.log(`✅ Set product type for ${item.description}: ${response.product_type}`);
            } else {
                // Fallback to first available type
                const fallbackType = item.availableProductTypes[0];
                products[item.productIndex].additional_categorizations[item.categorizationIndex].product_type = fallbackType;
                console.warn(`⚠️ Invalid/missing response for ${item.description}, using fallback: ${fallbackType}`);
            }
        }
    }

    createBatchProductTypePrompt(batchItems) {
        return `Select the most appropriate product type for each product.
        
For each item below, choose a product type from the provided options.

${batchItems.map((item, index) => `
Item ${index + 1}:
ID: "${item.id}"
Product: "${item.description}"
Category: ${item.category} → ${item.subcategory}
Available product types: ${JSON.stringify(item.availableProductTypes)}
`).join('\n')}

Return a JSON array with objects containing "id" and "product_type" fields:
[
  { "id": "product_0_cat_0", "product_type": "chosen type" },
  { "id": "product_1_cat_0", "product_type": "chosen type" },
  ...
]

CRITICAL: Include the EXACT ID string for each item in your response.`;
    }

    async determineProductType(productText, category, subcategory) {
        console.log(`🔍 determineProductType called for: ${productText} in ${category} > ${subcategory}`);

        // Get available product types
        let availableProductTypes = [];
        for (const cat of this.categoryData) {
            if (cat.name === category) {
                for (const subcat of cat.subcategories) {
                    if (subcat.name === subcategory) {
                        if (subcat.gridOnly || !subcat.productTypes || subcat.productTypes.length === 0) {
                            return subcategory;
                        }
                        availableProductTypes = subcat.productTypes;
                        break;
                    }
                }
                break;
            }
        }

        if (availableProductTypes.length === 0) {
            return subcategory;
        }

        const prompt = `Select the most appropriate product type for "${productText}" 
    from these options in ${category} → ${subcategory}:
    ${JSON.stringify(availableProductTypes)}
    
    Return ONLY a JSON object with "product_type" field:
    {
        "product_type": "[chosen type]"
    }`;

        try {
            const result = await this.model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1 }
            });

            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch[0]);

            if (parsed.product_type && availableProductTypes.includes(parsed.product_type)) {
                return parsed.product_type;
            } else {
                // Log invalid response
                console.warn(`Invalid product type response: ${parsed.product_type}`);
                throw new Error(`Invalid product type returned: ${parsed.product_type}`);
            }
        } catch (error) {
            console.error(`Error in product type selection: ${error}`);
            // Return first available type as fallback
            return availableProductTypes[0];
        }
    }
}

module.exports = ProductCategorizer;