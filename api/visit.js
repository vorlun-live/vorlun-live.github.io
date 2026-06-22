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
      const clientIp = 
        req.headers['x-forwarded-for'] || 
        req.headers['x-real-ip'] || 
        req.socket.remoteAddress || 
        '0.0.0.0';

      const nowTime = new Date().toISOString();
      
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
      // Запрашиваем записи из таблицы напрямую
      const { data, error: selectError } = await supabase
        .from('site_visits')
        .select('visited_at, visitor_ip')
        .order('visited_at', { ascending: false })
        .limit(500);

      if (selectError) throw selectError;

      // Группируем визиты по дням прямо на сервере
      const visitsMap = {}; 
      (data || []).forEach(row => {
        if (!row.visited_at) return;
        
        const dateObj = new Date(row.visited_at);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dateKey = `${day}.${month}`;

        if (!visitsMap[dateKey]) {
          visitsMap[dateKey] = new Set();
        }
        visitsMap[dateKey].add(row.visitor_ip);
      });

      const formattedData = Object.keys(visitsMap).map(dateStr => {
        const [day, month] = dateStr.split('.');
        return {
          visit_date: `2026-${month}-${day}T00:00:00.000Z`,
          unique_visitors: visitsMap[dateStr].size
        };
      });

      return res.status(200).json(formattedData);
    }
  } catch (err) {
    console.error("Supabase API error:", err);
    return res.status(500).json({ error: err.message });
  }
};