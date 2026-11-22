// api/auth.js - Vercel Serverless Function for eBay OAuth
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
    const { clientId, clientSecret, sandbox } = body;

    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'Client ID and Client Secret are required' });
    }

    const host = sandbox ? 'api.sandbox.ebay.com' : 'api.ebay.com';
    const url = `https://${host}/identity/v1/oauth2/token`;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `eBay Auth Error: ${errorText}` });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, token: data.access_token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
