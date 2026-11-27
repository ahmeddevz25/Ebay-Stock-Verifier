// api/verify-batch.js - Live eBay Browse API Verification (ESM)
import { getEbayToken, DEFAULT_CLIENT_ID, DEFAULT_CLIENT_SECRET } from './auth.js';

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

      if (item.estimatedAvailabilities && item.estimatedAvailabilities.length > 0) {
        const avail = item.estimatedAvailabilities[0];
        availableQty = avail.estimatedRemainingQuantity ?? avail.estimatedAvailableQuantity ?? 0;
        const availStatus = avail.estimatedAvailabilityStatus || avail.availabilityStatus || '';
        if (availStatus === 'OUT_OF_STOCK' || availableQty === 0) {
          status = 'OUT_OF_STOCK';
        } else if (availStatus === 'IN_STOCK' || availableQty > 0) {
          status = 'AVAILABLE';
        }
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (!body && req.on) {
      const buffers = [];
      for await (const chunk of req) buffers.push(chunk);
      try { body = JSON.parse(Buffer.concat(buffers).toString()); } catch (e) { body = {}; }
    } else if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    } else {
      body = body || {};
    }

    const { itemIds, token, sandbox, demoMode } = body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds array required' });
    }

    // If explicit demoMode is requested
    if (demoMode) {
      const results = {};
      for (const id of itemIds) {
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
      return res.status(200).json({ success: true, results, mode: 'demo' });
    }

    // Acquire or use real eBay access token
    let activeToken = token;
    if (!activeToken) {
      activeToken = await getEbayToken(null, null, !!sandbox);
    }

    // Query items in parallel
    const itemResults = await Promise.all(
      itemIds.map(id => checkSingleItem(id, activeToken, !!sandbox))
    );

    const results = {};
    for (const r of itemResults) {
      results[r.id] = r;
    }

    const rateLimited = itemResults.some(r => r.rateLimited);
    if (rateLimited) {
      return res.status(429).json({
        success: false,
        rateLimited: true,
        error: 'eBay API Daily Quota Exceeded (HTTP 429 Too Many Requests). The 5,000 requests/day limit on this eBay App has been reached. Quota resets at 08:00 UTC.',
        results
      });
    }

    return res.status(200).json({ success: true, results, mode: 'live' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
