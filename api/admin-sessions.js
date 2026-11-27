// api/admin-sessions.js - Fetch and Manage Client Sessions for Admin Dashboard
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jojsgxjobnuhucdiemzz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'ahmed123';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-passcode');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const clientPasscode = req.headers['x-admin-passcode'] || req.query?.passcode;
  if (!clientPasscode || clientPasscode !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
  }

  try {
    if (req.method === 'GET') {
      const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/client_sessions?select=*&order=created_at.desc&limit=100`, {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      });

      if (!supabaseRes.ok) {
        const errText = await supabaseRes.text();
        return res.status(500).json({ error: `Supabase Error (${supabaseRes.status}): ${errText}` });
      }

      const sessions = await supabaseRes.json();
      return res.status(200).json({ success: true, sessions });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'Session id required' });

      const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/client_sessions?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      });

      if (!supabaseRes.ok) {
        const errText = await supabaseRes.text();
        return res.status(500).json({ error: errText });
      }

      return res.status(200).json({ success: true, deleted: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
