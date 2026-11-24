// api/auth.js - eBay Production OAuth Token Generator
const DEFAULT_CLIENT_ID = process.env.EBAY_CLIENT_ID || '';
const DEFAULT_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || '';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getEbayToken(clientId = DEFAULT_CLIENT_ID, clientSecret = DEFAULT_CLIENT_SECRET, sandbox = false) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  const url = `https://${host}/identity/v1/oauth2/token`;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`eBay Auth Error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 7200) * 1000;
  return cachedToken;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const cId = body.clientId || DEFAULT_CLIENT_ID;
    const cSecret = body.clientSecret || DEFAULT_CLIENT_SECRET;
    const token = await getEbayToken(cId, cSecret, !!body.sandbox);
    return res.status(200).json({ success: true, token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports.getEbayToken = getEbayToken;
module.exports.DEFAULT_CLIENT_ID = DEFAULT_CLIENT_ID;
module.exports.DEFAULT_CLIENT_SECRET = DEFAULT_CLIENT_SECRET;
