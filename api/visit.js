const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized.' });
  }

  try {
    if (req.method === 'POST') {
      // Принудительно отправляем текущую дату и время при каждом визите
      const nowTime = new Date().toISOString();
      await supabase.from('site_visits').insert([{ visited_at: nowTime }]);
      return res.status(200).json({ status: 'ok' });
    } 
    
    if (req.method === 'GET') {
      const { data } = await supabase
        .from('site_visits')
        .select('visited_at')
        .order('visited_at', { ascending: false })
        .limit(30);

      return res.status(200).json(data || []);
    }
  } catch (err) {
    console.error("Supabase error:", err);
    return res.status(500).json({ error: err.message });
  }
};