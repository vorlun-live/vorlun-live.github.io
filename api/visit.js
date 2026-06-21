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
      // Получаем реальный IP-адрес, учитывая прокси-сервер (Vercel)
      const clientIp = 
        req.headers['x-forwarded-for'] || 
        req.headers['x-real-ip'] || 
        req.socket.remoteAddress || 
        '0.0.0.0';

      const nowTime = new Date().toISOString();
      
      // Производим вставку времени и определенного IP-адреса
      const { error: insertError } = await supabase
        .from('site_visits')
        .insert([{ 
          visited_at: nowTime,
          visitor_ip: clientIp
        }]);

      if (insertError) throw insertError;
      
      return res.status(200).json({ status: 'ok', ip: clientIp });
    } 
    
    if (req.method === 'GET') {
      // Запрашиваем сгруппированные данные из вашего представления
      const { data, error: selectError } = await supabase
        .from('unique_daily_visits')
        .select('visit_date, unique_visitors')
        .order('visit_date', { ascending: false })
        .limit(30);

      if (selectError) throw selectError;

      return res.status(200).json(data || []);
    }
  } catch (err) {
    console.error("Supabase API error:", err);
    return res.status(500).json({ error: err.message });
  }
};