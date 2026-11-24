// api/auth.js - eBay Production OAuth Token Generator (ESM)
export const DEFAULT_CLIENT_ID = process.env.EBAY_CLIENT_ID || '';
export const DEFAULT_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || '';

let cachedToken = null;
let tokenExpiresAt = 0;

export async function getEbayToken(clientId, clientSecret, sandbox = false) {
  const cId = clientId || process.env.EBAY_CLIENT_ID || DEFAULT_CLIENT_ID;
  const cSec = clientSecret || process.env.EBAY_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;

  if (!cId || !cSec) {
    throw new Error('eBay API Credentials missing: Please configure EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in Vercel / .env.local');
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
  const url = `https://${host}/identity/v1/oauth2/token`;
  const creds = Buffer.from(`${cId}:${cSec}`).toString('base64');

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

    const cId = body.clientId || process.env.EBAY_CLIENT_ID || DEFAULT_CLIENT_ID;
    const cSecret = body.clientSecret || process.env.EBAY_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;
    const token = await getEbayToken(cId, cSecret, !!body.sandbox);
    return res.status(200).json({ success: true, token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
