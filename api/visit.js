import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL or SUPABASE_KEY are missing in Vercel Environment Variables.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date().toISOString();

    // Более надежный способ получения реального IP-адреса для Vercel
    const rawIp = req.headers['x-forwarded-for'];
    const ip = rawIp ? rawIp.split(',')[0].trim() : (req.socket?.remoteAddress || '127.0.0.1');

    const { error: insertError } = await supabase
      .from('site_visits')
      .insert([{ visited_at: now, ip: ip }]);

    if (insertError) {
      throw new Error(`DB insert failed: ${insertError.message}`);
    }

    return res.status(200).json({ success: true, recordedIp: ip });

  } catch (error) {
    console.error('API /api/visit error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}