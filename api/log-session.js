// api/log-session.js - Log Client Verification Session to Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jojsgxjobnuhucdiemzz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

    const {
      id = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      fileName = 'Unnamed_Sheet.xlsx',
      fileSize = 0,
      totalItems = 0,
      inStock = 0,
      outStock = 0,
      ended = 0,
      rateLimited = false,
      errorDetails = '',
      itemsData = []
    } = body;

    // Insert record into Supabase client_sessions table
    const record = {
      id,
      file_name: fileName,
      file_size: fileSize,
      total_items: totalItems,
      in_stock: inStock,
      out_of_stock: outStock,
      ended: ended,
      rate_limited: !!rateLimited,
      error_details: errorDetails || '',
      items_data: itemsData.slice(0, 1000), // preserve up to 1,000 items for admin review
      created_at: new Date().toISOString()
    };

    const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/client_sessions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(record)
    });

    if (!supabaseRes.ok) {
      const errText = await supabaseRes.text();
      console.warn('Supabase log insert warning:', supabaseRes.status, errText);
      return res.status(200).json({ success: false, warning: errText });
    }

    return res.status(200).json({ success: true, sessionId: id });
  } catch (err) {
    console.error('Error logging session:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
}
