const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv'
};

// Helper to parse JSON body from incoming requests
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Fetch OAuth token from eBay
async function getEbayOAuthToken(clientId, clientSecret, sandbox = false) {
  const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  const url = `https://${host}/identity/v1/oauth2/token`;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`eBay Auth Error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Query eBay Browse API for a batch of item IDs (up to 20 per request)
async function checkEbayBatch(itemIds, token, sandbox = false) {
  const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  // Browse API: GET /buy/browse/v1/item?item_ids=...
  const url = `https://${host}/buy/browse/v1/item?item_ids=${itemIds.join(',')}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'Accept': 'application/json'
    }
  });

  const raw = await res.json();
  const results = {};

  if (raw.items && Array.isArray(raw.items)) {
    for (const item of raw.items) {
      // eBay item ID might have format "v1|123456789012|0" or raw 12 digits
      const rawId = item.itemId;
      const matchedId = itemIds.find(id => rawId.includes(id)) || rawId;

      let status = 'AVAILABLE';
      let availableQty = 0;

      if (item.estimatedAvailabilities && item.estimatedAvailabilities.length > 0) {
        const avail = item.estimatedAvailabilities[0];
        availableQty = avail.estimatedAvailableQuantity || 0;
        const availStatus = avail.availabilityStatus || '';

        if (availStatus === 'OUT_OF_STOCK' || availableQty === 0) {
          status = 'OUT_OF_STOCK';
        } else if (availStatus === 'IN_STOCK' || availableQty > 0) {
          status = 'AVAILABLE';
        }
      }

      if (item.itemEndDate) {
        const endDate = new Date(item.itemEndDate);
        if (endDate < new Date()) {
          status = 'ENDED / SOLD OUT';
        }
      }

      results[matchedId] = {
        status,
        quantity: availableQty,
        title: item.title || '',
        price: item.price ? `${item.price.currency} ${item.price.value}` : '',
        found: true
      };
    }
  }

  // Handle items that returned 404 or were not in items list
  if (raw.errors && Array.isArray(raw.errors)) {
    for (const err of raw.errors) {
      const match = err.parameters && err.parameters.find(p => p.name === 'item_ids');
      if (match) {
        results[match.value] = {
          status: 'INVALID / REMOVED',
          quantity: 0,
          title: 'Not Found on eBay',
          price: '',
          found: false
        };
      }
    }
  }

  // Any remaining item IDs that didn't appear in items or errors
  for (const id of itemIds) {
    if (!results[id]) {
      results[id] = {
        status: 'ENDED / NOT FOUND',
        quantity: 0,
        title: 'Listing Ended or Inaccessible',
        price: '',
        found: false
      };
    }
  }

  return results;
}

// Simulated mock check for testing without eBay credentials
function mockCheckBatch(itemIds) {
  const results = {};
  for (const id of itemIds) {
    // Deterministic pseudo-random based on item ID hash
    const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const mod = hash % 100;

    if (mod < 60) {
      results[id] = {
        status: 'AVAILABLE',
        quantity: (hash % 45) + 1,
        title: `Product Listing #${id}`,
        price: `USD ${((hash % 150) + 9.99).toFixed(2)}`,
        found: true
      };
    } else if (mod < 80) {
      results[id] = {
        status: 'OUT_OF_STOCK',
        quantity: 0,
        title: `Out of Stock Item #${id}`,
        price: `USD ${((hash % 100) + 14.50).toFixed(2)}`,
        found: true
      };
    } else if (mod < 95) {
      results[id] = {
        status: 'ENDED / SOLD OUT',
        quantity: 0,
        title: `Completed Listing #${id}`,
        price: `USD ${((hash % 200) + 25.00).toFixed(2)}`,
        found: true
      };
    } else {
      results[id] = {
        status: 'INVALID / REMOVED',
        quantity: 0,
        title: `Listing Deleted or Inaccessible`,
        price: '',
        found: false
      };
    }
  }
  return results;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // --- API Endpoints ---
  if (req.method === 'POST' && pathname === '/api/ebay/auth') {
    try {
      const { clientId, clientSecret, sandbox } = await getJsonBody(req);
      if (!clientId || !clientSecret) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Client ID and Client Secret are required' }));
        return;
      }
      const token = await getEbayOAuthToken(clientId, clientSecret, !!sandbox);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, token }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/ebay/verify-batch') {
    try {
      const { itemIds, token, sandbox, demoMode } = await getJsonBody(req);
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'itemIds array required' }));
        return;
      }

      if (demoMode || !token) {
        // Return simulated mock verification
        const results = mockCheckBatch(itemIds);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, results, mode: 'demo' }));
        return;
      }

      // Live eBay API call
      const results = await checkEbayBatch(itemIds, token, !!sandbox);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, results, mode: 'live' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // --- Static File Serving ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading requested file');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 eBay Stock Verifier running at: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
