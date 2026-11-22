// api/verify-batch.js - Vercel Serverless Function for eBay Batch Verification
function mockCheckBatch(itemIds) {
  const results = {};
  for (const id of itemIds) {
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

async function checkEbayBatch(itemIds, token, sandbox = false) {
  const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { itemIds, token, sandbox, demoMode } = body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds array required' });
    }

    if (demoMode || !token) {
      const results = mockCheckBatch(itemIds);
      return res.status(200).json({ success: true, results, mode: 'demo' });
    }

    const results = await checkEbayBatch(itemIds, token, !!sandbox);
    return res.status(200).json({ success: true, results, mode: 'live' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
