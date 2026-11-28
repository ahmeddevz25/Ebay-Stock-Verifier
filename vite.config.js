import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const env = loadEnv('development', process.cwd(), '');
const PRODUCTION_CLIENT_ID = env.EBAY_CLIENT_ID || env.VITE_EBAY_CLIENT_ID || process.env.EBAY_CLIENT_ID || '';
const PRODUCTION_CLIENT_SECRET = env.EBAY_CLIENT_SECRET || env.VITE_EBAY_CLIENT_SECRET || process.env.EBAY_CLIENT_SECRET || '';
const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL || 'https://jojsgxjobnuhucdiemzz.supabase.co';
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const ADMIN_PASSCODE = env.ADMIN_PASSCODE || process.env.ADMIN_PASSCODE || 'ahmed123';

let localCachedToken = null;
let localTokenExpiry = 0;

async function getLocalEbayToken(clientId = PRODUCTION_CLIENT_ID, clientSecret = PRODUCTION_CLIENT_SECRET, sandbox = false) {
  const now = Date.now();
  if (localCachedToken && now < localTokenExpiry - 60000) {
    return localCachedToken;
  }

  const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`https://${host}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`eBay Auth Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  localCachedToken = data.access_token;
  localTokenExpiry = now + (data.expires_in || 7200) * 1000;
  return localCachedToken;
}

async function checkSingleItem(itemId, token, sandbox = false) {
  const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  const param = itemId.startsWith('v1|') ? itemId : `v1|${itemId}|0`;
  const url = `https://${host}/buy/browse/v1/item/${encodeURIComponent(param)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept': 'application/json'
      }
    });

    if (res.status === 200) {
      const item = await res.json();
      let status = 'AVAILABLE';
      let availableQty = 0;

      // 1. Check if listing has already ended (expired itemEndDate)
      const now = Date.now();
      const endDateMs = item.itemEndDate ? new Date(item.itemEndDate).getTime() : null;
      const isEnded = endDateMs && endDateMs <= now;

      if (isEnded) {
        status = 'ENDED / SOLD OUT';
        availableQty = 0;
      } else if (item.estimatedAvailabilities && item.estimatedAvailabilities.length > 0) {
        const avail = item.estimatedAvailabilities[0];
        availableQty = avail.estimatedRemainingQuantity ?? avail.estimatedAvailableQuantity ?? 0;
        const availStatus = avail.estimatedAvailabilityStatus || avail.availabilityStatus || '';
        if (availStatus === 'OUT_OF_STOCK' || availableQty === 0) {
          status = 'OUT_OF_STOCK';
        } else if (availStatus === 'IN_STOCK' || availableQty > 0) {
          status = 'AVAILABLE';
        }
      } else if (item.estimatedAvailableQuantity === 0) {
        status = 'OUT_OF_STOCK';
        availableQty = 0;
      }

      return {
        id: itemId,
        status,
        quantity: availableQty,
        title: item.title || '',
        price: item.price ? `${item.price.currency} ${item.price.value}` : '',
        found: true
      };
    } else if (res.status === 404) {
      return {
        id: itemId,
        status: 'ENDED / NOT FOUND',
        quantity: 0,
        title: 'Listing Ended or Removed',
        price: '',
        found: false
      };
    } else if (res.status === 429) {
      return {
        id: itemId,
        status: 'RATE_LIMITED',
        quantity: 0,
        title: 'eBay Daily Quota Reached (429)',
        price: '',
        found: false,
        rateLimited: true
      };
    } else {
      return {
        id: itemId,
        status: 'INVALID / REMOVED',
        quantity: 0,
        title: `eBay Status ${res.status}`,
        price: '',
        found: false
      };
    }
  } catch (err) {
    return {
      id: itemId,
      status: 'ERROR',
      quantity: 0,
      title: err.message,
      price: '',
      found: false
    };
  }
}

function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Handle OAuth Authentication
        if ((req.url === '/api/ebay/auth' || req.url === '/api/auth') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { clientId, clientSecret, sandbox } = JSON.parse(body || '{}');
              const cId = clientId || PRODUCTION_CLIENT_ID;
              const cSec = clientSecret || PRODUCTION_CLIENT_SECRET;
              const token = await getLocalEbayToken(cId, cSec, !!sandbox);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, token, mode: sandbox ? 'sandbox' : 'production' }));
            } catch (err) {
              console.error('Local Auth error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Handle Batch Verification
        if ((req.url?.startsWith('/api/ebay/verify-batch') || req.url?.startsWith('/api/verify-batch')) && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const { itemIds, token, sandbox, demoMode } = parsed;

              if (demoMode) {
                const results = {};
                for (const id of (itemIds || [])) {
                  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
                  const mod = hash % 100;
                  if (mod < 62) {
                    results[id] = { status: 'AVAILABLE', quantity: (hash % 45) + 1, title: `Product Listing #${id}`, price: `USD ${((hash % 150) + 9.99).toFixed(2)}`, found: true };
                  } else if (mod < 82) {
                    results[id] = { status: 'OUT_OF_STOCK', quantity: 0, title: `Out of Stock Item #${id}`, price: `USD ${((hash % 100) + 14.50).toFixed(2)}`, found: true };
                  } else {
                    results[id] = { status: 'ENDED / SOLD OUT', quantity: 0, title: `Completed Listing #${id}`, price: `USD ${((hash % 200) + 25.00).toFixed(2)}`, found: true };
                  }
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, results, mode: 'demo' }));
                return;
              }

              // Real Live eBay Production verification
              const activeToken = token || (await getLocalEbayToken(PRODUCTION_CLIENT_ID, PRODUCTION_CLIENT_SECRET, !!sandbox));
              const itemResults = await Promise.all(
                (itemIds || []).map(id => checkSingleItem(id, activeToken, !!sandbox))
              );

              const results = {};
              for (const r of itemResults) {
                results[r.id] = r;
              }

              const rateLimited = itemResults.some(r => r.rateLimited);
              if (rateLimited) {
                res.statusCode = 429;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: false,
                  rateLimited: true,
                  error: 'eBay API Daily Quota Exceeded (HTTP 429 Too Many Requests). The 5,000 requests/day limit on this eBay App has been reached. Quota resets at 00:00 UTC.',
                  results
                }));
                return;
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, results, mode: 'live' }));
            } catch (err) {
              console.error('Local API error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // Handle Session Logging to Supabase
        if (req.url === '/api/log-session' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const record = {
                id: parsed.id || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                file_name: parsed.fileName || 'Unnamed_Sheet.xlsx',
                file_size: parsed.fileSize || 0,
                total_items: parsed.totalItems || 0,
                in_stock: parsed.inStock || 0,
                out_of_stock: parsed.outStock || 0,
                ended: parsed.ended || 0,
                rate_limited: !!parsed.rateLimited,
                error_details: parsed.errorDetails || '',
                items_data: (parsed.itemsData || []).slice(0, 1000),
                created_at: new Date().toISOString()
              };

              const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/client_sessions`, {
                method: 'POST',
                headers: {
                  'apikey': SUPABASE_SERVICE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify(record)
              });

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: sbRes.ok }));
            } catch (err) {
              console.warn('Local log-session error:', err.message);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // Handle Admin Sessions Fetch / Delete
        if (req.url?.startsWith('/api/admin-sessions')) {
          const clientPasscode = req.headers['x-admin-passcode'];
          if (clientPasscode !== ADMIN_PASSCODE) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'Unauthorized: Invalid Admin PIN' }));
          }

          if (req.method === 'GET') {
            try {
              const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/client_sessions?select=*&order=created_at.desc&limit=100`, {
                headers: {
                  'apikey': SUPABASE_SERVICE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
                }
              });
              const sessions = await sbRes.json();
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, sessions }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }
          }

          if (req.method === 'DELETE') {
            const urlObj = new URL(req.url, 'http://localhost');
            const id = urlObj.searchParams.get('id');
            try {
              await fetch(`${SUPABASE_URL}/rest/v1/client_sessions?id=eq.${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: {
                  'apikey': SUPABASE_SERVICE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
                }
              });
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, deleted: id }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }
          }
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
