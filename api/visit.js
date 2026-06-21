const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

module.exports = async (req, res) => {
  // Настройка CORS для API
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
      // Извлекаем IP-адрес из заголовков прокси (Vercel/узел) или используем заглушку
      const ipAddress = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || '0.0.0.0';
      const nowTime = new Date().toISOString();
      
      // Отправляем визит вместе с IP
      await supabase.from('site_visits').insert([{ 
        visited_at: nowTime,
        visitor_ip: ipAddress
      }]);

      return res.status(200).json({ status: 'ok', ip: ipAddress });
    } 
    
    if (req.method === 'GET') {
      // Получаем сгруппированные данные из SQL-представления (вьюхи) unique_daily_visits,
      // где подсчитываются уникальные IP за каждый день (колонка visit_date, unique_visitors)
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('visit_date, unique_visitors')
        .order('visit_date', { ascending: false })
        .limit(30);

      if (error) throw error;

      return res.status(200).json(data || []);
    }
  } catch (err) {
    console.error("Supabase error:", err);
    return res.status(500).json({ error: err.message });
  }
};