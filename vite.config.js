import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Handle OAuth Authentication
        if (req.url === '/api/ebay/auth' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { clientId, clientSecret, sandbox } = JSON.parse(body || '{}');
              if (!clientId || !clientSecret) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Client ID and Client Secret are required' }));
                return;
              }

              const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
              const url = `https://${host}/identity/v1/oauth2/token`;
              const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

              const response = await fetch(url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Authorization': `Basic ${auth}`
                },
                body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
              });

              if (!response.ok) {
                const errText = await response.text();
                res.statusCode = response.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `eBay Auth Error (${response.status}): ${errText}` }));
                return;
              }

              const data = await response.json();
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, token: data.access_token, mode: sandbox ? 'sandbox' : 'production' }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Handle Batch Verification
        if (req.url?.startsWith('/api/ebay/verify-batch') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const { itemIds, token, sandbox, demoMode } = parsed;

              if (demoMode || !token) {
                const results = {};
                for (const id of (itemIds || [])) {
                  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                  const mod = hash % 100;
                  if (mod < 62) {
                    results[id] = { status: 'AVAILABLE', quantity: (hash % 45) + 1, title: `Product Listing #${id}`, price: `USD ${((hash % 150) + 9.99).toFixed(2)}`, found: true };
                  } else if (mod < 82) {
                    results[id] = { status: 'OUT_OF_STOCK', quantity: 0, title: `Out of Stock Item #${id}`, price: `USD ${((hash % 100) + 14.50).toFixed(2)}`, found: true };
                  } else if (mod < 96) {
                    results[id] = { status: 'ENDED / SOLD OUT', quantity: 0, title: `Completed Listing #${id}`, price: `USD ${((hash % 200) + 25.00).toFixed(2)}`, found: true };
                  } else {
                    results[id] = { status: 'INVALID / REMOVED', quantity: 0, title: `Listing Deleted or Inaccessible`, price: '', found: false };
                  }
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, results, mode: 'demo' }));
                return;
              }

              // Live / Sandbox eBay Browse API
              const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
              const ebayUrl = `https://${host}/buy/browse/v1/item?item_ids=${itemIds.join(',')}`;

              const ebayRes = await fetch(ebayUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
                  'Accept': 'application/json'
                }
              });

              if (!ebayRes.ok) {
                // If live call returned error (e.g. sandbox item not found), fallback safely
                const errJson = await ebayRes.json().catch(() => ({}));
                const results = {};
                for (const id of itemIds) {
                  results[id] = {
                    status: 'ENDED / SOLD OUT',
                    quantity: 0,
                    title: `Item #${id}`,
                    price: '',
                    found: false
                  };
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, results, warning: errJson }));
                return;
              }

              const raw = await ebayRes.json();
              const results = {};

              if (raw.items && Array.isArray(raw.items)) {
                for (const item of raw.items) {
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

                  if (item.itemEndDate && new Date(item.itemEndDate) < new Date()) {
                    status = 'ENDED / SOLD OUT';
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

              for (const id of itemIds) {
                if (!results[id]) {
                  results[id] = {
                    status: 'ENDED / SOLD OUT',
                    quantity: 0,
                    title: `Item #${id}`,
                    price: '',
                    found: false
                  };
                }
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, results, mode: sandbox ? 'sandbox' : 'production' }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  server: {
    port: 3000
  }
});
