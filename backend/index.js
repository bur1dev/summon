// backend/index.js

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Root Route
app.get('/', (req, res) => {
  res.send('🎉 Welcome! The backend server is running successfully.');
});

// In-memory token storage
let accessToken = null;
let tokenExpiresAt = null;

/**
 * Fetches an access token from Kroger API using client credentials.
 */
async function getAccessToken() {
  const now = Date.now();

  if (accessToken && tokenExpiresAt && now < tokenExpiresAt) {
    return accessToken;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.KROGER_CLIENT_ID,
    client_secret: process.env.KROGER_CLIENT_SECRET,
    scope: 'product.compact',
  });

  try {
    const response = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Token request failed with status ${response.status}: ${errorText}`);
      throw new Error(`Token request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiresAt = now + data.expires_in * 1000; // Convert expires_in to milliseconds

    console.log('Access token acquired successfully.');
    return accessToken;
  } catch (error) {
    console.error('Error fetching access token:', error.message);
    throw error;
  }
}

/**
 * Endpoint to fetch locations (stores).
 * Example: GET http://localhost:3000/api/locations?zipCode=92024&chain=Ralphs&limit=5
 */
app.get('/api/locations', async (req, res) => {
  const { zipCode, chain, limit } = req.query;

  if (!zipCode || !chain) {
    return res.status(400).json({ error: 'Missing required query parameters: zipCode, chain' });
  }

  try {
    const token = await getAccessToken();

    const params = new URLSearchParams({
      'filter.zipCode.near': zipCode,
      'filter.chain': chain,
      'filter.limit': limit || '5',
    });

    const response = await fetch(`https://api.kroger.com/v1/locations?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Location request failed with status ${response.status}: ${errorText}`);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    return res.json(data.data); // Send the array of locations to the frontend
  } catch (error) {
    console.error('Error fetching locations:', error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/products', async (req, res) => {
  const { searchTerm, locationId, limit } = req.query;

  if (!searchTerm || !locationId) {
    return res.status(400).json({ error: 'Missing required query parameters: searchTerm, locationId' });
  }

  try {
    const token = await getAccessToken();

    const params = new URLSearchParams({
      'filter.term': searchTerm,
      'filter.locationId': locationId,
      'filter.limit': limit || '50',
    });

    const response = await fetch(`https://api.kroger.com/v1/products?${params.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Product request failed with status ${response.status}: ${errorText}`);
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    return res.json(data.data); // Send the array of products to the frontend
  } catch (error) {
    console.error('Error fetching products:', error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});

app.get('/api/all-products', async (req, res) => {
  const { locationId } = req.query;
  const allProducts = [];
  const searchTerms = ['grapes', 'produce', 'apples', 'eggs', 'milk', 'yogurt', 'bread', 'fruit', 'vegetables', 'basil', 'soda', 'sprite'];




  try {
    console.log(`Fetching all products for location: ${locationId}`);

    for (const term of searchTerms) {
      let start = 0;
      const limit = 50;

      while (start <= 250) { // Kroger API limit
        const token = await getAccessToken();
        const params = new URLSearchParams({
          'filter.locationId': locationId,
          'filter.limit': limit.toString(),
          'filter.start': start.toString(),
          'filter.term': term,
          'filter.fulfillment': 'ais' // Available In Store
        });

        console.log(`Making request with params:`, params.toString());

        const response = await fetch(`https://api.kroger.com/v1/products?${params.toString()}`, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error(`Response not OK for term "${term}":`, await response.text());
          break;
        }

        const data = await response.json();

        if (!data.data?.length) {
          console.log(`No more products found for term "${term}"`);
          break;
        }

        const newProducts = data.data.filter(product => {
          const hasPrice = (product.items?.[0]?.price?.regular || 0) > 0;
          const isNew = !allProducts.some(p => p.productId === product.productId);
          return hasPrice && isNew;
        });

        allProducts.push(...newProducts);
        console.log(`Got ${newProducts.length} new products for "${term}" (start=${start}). Total: ${allProducts.length}`);

        start += limit;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
      }
    }

    console.log(`Returning ${allProducts.length} total unique products`);
    return res.json(allProducts);

  } catch (error) {
    console.error('Detailed error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/categorize', async (req, res) => {
  console.log("Categorize endpoint hit with", req.body.length, "products");
  const products = req.body;

  try {
    // Create a temporary file with the product data
    const tempFilePath = path.join(os.tmpdir(), `products-${Date.now()}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(products));

    const pythonProcess = spawn('/home/bur1/Holochain/Moss/summon/env/bin/python3', [
      'test.py',
      '--file',
      tempFilePath
    ], {
      cwd: '/home/bur1/Holochain/Moss/summon/product-categorization',
      maxBuffer: 1024 * 1024 * 10
    });

    let output = '';
    pythonProcess.stdout.on('data', (data) => output += data);
    pythonProcess.stderr.on('data', (data) => console.error('Python error:', data.toString()));

    pythonProcess.on('close', (code) => {
      // Clean up the temporary file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error('Error deleting temp file:', e);
      }

      if (code !== 0) return res.status(500).json({ error: 'Python process failed' });
      try {
        // Debug the raw output
        console.log("Raw Python output:", output.substring(0, 200) + "...");

        // Clean the output - get only the last line if multiple lines
        const cleanedOutput = output.split('\n').filter(line => line.trim()).pop() || '';
        const categorizations = JSON.parse(cleanedOutput);

        // Save categorized products
        const categorizedDataPath = path.join(__dirname, '../product-categorization/categorized_products.json');
        let allCategorized = [];

        // If file exists, read and append to it
        if (fs.existsSync(categorizedDataPath)) {
          try {
            const existingData = JSON.parse(fs.readFileSync(categorizedDataPath, 'utf8'));
            // Create a map of existing product IDs to avoid duplicates
            const existingProductIds = new Set();
            existingData.forEach(product => {
              if (product.productId) {
                existingProductIds.add(product.productId);
              }
            });

            // Only add products that aren't already in the file
            const newProducts = categorizations.filter(product =>
              !product.productId || !existingProductIds.has(product.productId)
            );

            allCategorized = existingData.concat(newProducts);
            console.log(`Added ${newProducts.length} new products (skipped ${categorizations.length - newProducts.length} duplicates)`);
          } catch (readError) {
            console.error('Error reading existing categorized data, starting fresh:', readError);
            allCategorized = categorizations;
          }
        } else {
          allCategorized = categorizations;
        }

        fs.writeFileSync(categorizedDataPath, JSON.stringify(allCategorized));
        console.log(`Saved categorized products file with ${allCategorized.length} total products`);

        res.json(categorizations);
      } catch (e) {
        console.error('Error processing categorization output:', e);
        res.status(500).json({ error: 'Invalid JSON output' });
      }
    });
  } catch (error) {
    console.error('Categorization error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/report-category', (req, res) => {
  try {
    const reportData = req.body;

    // Add server timestamp
    reportData.server_timestamp = new Date().toISOString();

    // Append to the report file
    const reportFile = path.join(__dirname, '../product-categorization/reported_categorizations.jsonl');

    fs.appendFileSync(
      reportFile,
      JSON.stringify(reportData) + '\n'
    );

    console.log('Category report received:', reportData);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving category report:', error);
    return res.status(500).json({ error: 'Failed to save category report' });
  }
});

// Get all category reports
app.get('/api/category-reports', (req, res) => {
  try {
    const reportFile = path.join(__dirname, '../product-categorization/reported_categorizations.jsonl');

    // Check if file exists
    if (!fs.existsSync(reportFile)) {
      return res.json([]);
    }

    // Read and parse the file
    const content = fs.readFileSync(reportFile, 'utf8');
    if (!content.trim()) {
      return res.json([]);
    }

    const lines = content.trim().split('\n');

    const reports = lines.map((line, index) => {
      const report = JSON.parse(line);
      // Add ID for easy reference
      return { id: index, ...report };
    });

    return res.json(reports);
  } catch (error) {
    console.error('Error reading reports:', error);
    return res.status(500).json({ error: 'Failed to read category reports' });
  }
});

// Approve or reject a report
app.post('/api/approve-category-report', (req, res) => {
  try {
    console.log('Request:', req.body);

    const { reportId, approve } = req.body;
    if (reportId === undefined || approve === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const reportFile = path.join(__dirname, '../product-categorization/reported_categorizations.jsonl');
    const correctionMapFile = path.join(__dirname, '../product-categorization/correction_map.json');

    // Read reports
    const content = fs.readFileSync(reportFile, 'utf8');
    const lines = content.trim().split('\n');
    const reports = lines.map(line => JSON.parse(line));

    const index = parseInt(reportId, 10);

    if (isNaN(index) || index < 0 || index >= reports.length) {
      return res.status(404).json({ error: `Report not found: ${reportId}` });
    }

    // Mark the report as approved or rejected
    const report = reports[index];
    report.status = approve ? 'approved' : 'rejected';
    report.reviewed_at = new Date().toISOString();

    // Save the updated report
    const updatedLines = reports.map(r => JSON.stringify(r));
    fs.writeFileSync(reportFile, updatedLines.join('\n') + '\n');

    // If approved, update the correction map
    if (approve) {
      // Load existing correction map or create empty one
      let correctionMap = {};
      if (fs.existsSync(correctionMapFile)) {
        try {
          correctionMap = JSON.parse(fs.readFileSync(correctionMapFile, 'utf8'));
        } catch (err) {
          console.error('Error reading correction map file:', err);
          correctionMap = {};
        }
      }

      try {
        // Check if suggestedCategory exists before using it
        if (!report.suggestedCategory) {
          return res.status(400).json({ error: 'Missing suggested category in report' });
        }

        // 1. Store product ID match (most reliable)
        if (report.product.productId) {
          correctionMap[`productId:${report.product.productId}`] = {
            category: report.suggestedCategory.category,
            subcategory: report.suggestedCategory.subcategory,
            product_type: report.suggestedCategory.product_type
          };
          console.log(`Added product ID mapping: productId:${report.product.productId}`);
        }

        // 2. Store exact product name (case preserved but without special chars)
        const cleanName = report.product.name.replace(/[®™©]/g, '');
        correctionMap[cleanName] = {
          category: report.suggestedCategory.category,
          subcategory: report.suggestedCategory.subcategory,
          product_type: report.suggestedCategory.product_type
        };
        console.log(`Added clean name mapping: ${cleanName}`);

        // 3. Store exact product name (lowercase)
        correctionMap[cleanName.toLowerCase()] = {
          category: report.suggestedCategory.category,
          subcategory: report.suggestedCategory.subcategory,
          product_type: report.suggestedCategory.product_type
        };
        console.log(`Added lowercase name mapping: ${cleanName.toLowerCase()}`);

        // 4. For Reser's products specifically, add brand-specific match
        if (cleanName.toLowerCase().includes('reser')) {
          const reserSpecificName = cleanName.toLowerCase().replace(/reser'?s\s+/i, '');
          correctionMap[reserSpecificName] = {
            category: report.suggestedCategory.category,
            subcategory: report.suggestedCategory.subcategory,
            product_type: report.suggestedCategory.product_type
          };
          console.log(`Added Reser's specific mapping: ${reserSpecificName}`);
        }

        // Save updated correction map
        fs.writeFileSync(correctionMapFile, JSON.stringify(correctionMap, null, 2));
        console.log(`Report ${reportId} approved and added to correction map with multiple keys`);
      } catch (err) {
        console.error('Error updating correction map:', err);
        return res.status(500).json({ error: 'Failed to update correction map' });
      }
    } else {
      console.log(`Report ${reportId} rejected`);
    }

    // Handle negative examples
    if (report.type === "negative_example") {
      const pythonProcess = spawn('/home/bur1/Holochain/Moss/summon/env/bin/python3', [
        'add_negative_example.py',
        '--product', report.product.name,
        '--category', report.currentCategory.category,
        '--subcategory', report.currentCategory.subcategory,
        '--product_type', report.currentCategory.product_type
      ], {
        cwd: '/home/bur1/Holochain/Moss/summon/product-categorization'
      });

      let output = '';
      pythonProcess.stdout.on('data', (data) => output += data);

      pythonProcess.stderr.on('data', (data) => {
        console.error('Error in negative example script:', data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Negative example process exited with code ${code}`);
        } else {
          console.log(`Successfully added negative example for ${report.product.name}`);
        }
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error processing report approval:', error);
    return res.status(500).json({ error: `Failed to process report: ${error.message}` });
  }
});

app.post('/api/rebuild-categorizer', async (req, res) => {
  try {
    // Spawn the Python rebuild script
    const pythonProcess = spawn('/home/bur1/Holochain/Moss/summon/env/bin/python3', [
      'rebuild_index.py'
    ], {
      cwd: '/home/bur1/Holochain/Moss/summon/product-categorization',
      maxBuffer: 1024 * 1024 * 10
    });

    let output = '';
    pythonProcess.stdout.on('data', (data) => output += data);

    let errorOutput = '';
    pythonProcess.stderr.on('data', (data) => {
      console.error('Python rebuild error:', data.toString());
      errorOutput += data;
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python rebuild process exited with code ${code}`);
        return res.status(500).json({
          success: false,
          error: `Process exited with code ${code}`,
          details: errorOutput
        });
      }

      try {
        const result = JSON.parse(output);
        res.json(result);
      } catch (e) {
        // Try to extract just the last line which should be the JSON
        const lastLine = output.trim().split('\n').pop();
        try {
          const result = JSON.parse(lastLine);
          res.json(result);
        } catch (lastLineError) {
          console.error('Invalid JSON output from rebuild script:', e);
          res.status(500).json({
            success: false,
            error: 'Invalid output from rebuild script',
            details: output
          });
        }
      }
    });
  } catch (error) {
    console.error('Error running rebuild script:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/convert-failed-categorizations', (req, res) => {
  try {
    const pythonProcess = spawn('/home/bur1/Holochain/Moss/summon/env/bin/python3', [
      'convert_failures.py'
    ], {
      cwd: '/home/bur1/Holochain/Moss/summon/product-categorization',
    });

    let output = '';
    pythonProcess.stdout.on('data', (data) => output += data);

    let errorOutput = '';
    pythonProcess.stderr.on('data', (data) => {
      console.error('Python conversion error:', data.toString());
      errorOutput += data;
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python process exited with code ${code}`);
        return res.status(500).json({
          success: false,
          error: `Process exited with code ${code}`,
          details: errorOutput
        });
      }

      try {
        const result = JSON.parse(output);
        res.json(result);
      } catch (e) {
        // Try to extract just the last line which should be the JSON
        const lastLine = output.trim().split('\n').pop();
        try {
          const result = JSON.parse(lastLine);
          res.json(result);
        } catch (lastLineError) {
          console.error('Invalid JSON output from conversion script:', e);
          res.status(500).json({
            success: false,
            error: 'Invalid output from conversion script',
            details: output
          });
        }
      }
    });
  } catch (error) {
    console.error('Error running conversion script:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/update-report-category', (req, res) => {
  try {
    const { reportId, suggestedCategory } = req.body;

    // Add this line to define reportFile:
    const reportFile = path.join(__dirname, '../product-categorization/reported_categorizations.jsonl');

    // Rest of your code...
    const content = fs.readFileSync(reportFile, 'utf8');
    const lines = content.trim().split('\n');
    const reports = lines.map(line => JSON.parse(line));

    // Update the report
    reports[reportId].suggestedCategory = suggestedCategory;

    // Write back to file
    fs.writeFileSync(reportFile, reports.map(r => JSON.stringify(r)).join('\n') + '\n');

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/load-categorized-products', (req, res) => {
  const categorizedDataPath = path.join(__dirname, '../product-categorization/categorized_products.json');

  try {
    if (fs.existsSync(categorizedDataPath)) {
      const data = fs.readFileSync(categorizedDataPath, 'utf8');
      const products = JSON.parse(data);
      console.log(`Loaded ${products.length} categorized products from saved file`);
      res.json(products);
    } else {
      console.log('No saved categorized products file found');
      res.status(404).json({ error: 'No categorized products found' });
    }
  } catch (error) {
    console.error('Error loading categorized products:', error);
    res.status(500).json({ error: `Failed to load categorized products: ${error.message}` });
  }
});

app.post('/api/report-incorrect-category', (req, res) => {
  try {
    const { product, currentCategory } = req.body;

    const reportData = {
      product: product,
      currentCategory: currentCategory,
      timestamp: new Date().toISOString(),
      server_timestamp: new Date().toISOString(),
      type: "negative_example"
    };

    const reportFile = path.join(__dirname, '../product-categorization/reported_categorizations.jsonl');
    fs.appendFileSync(reportFile, JSON.stringify(reportData) + '\n');
    console.log('Incorrect category report received:', reportData);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving incorrect category report:', error);
    return res.status(500).json({ error: 'Failed to save report' });
  }
});