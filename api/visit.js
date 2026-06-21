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
      // Запрашиваем ВСЕ записи из таблицы визитов, обходя проблемы с представлениями
      const { data, error: selectError } = await supabase
        .from('site_visits')
        .select('visited_at, visitor_ip')
        .order('visited_at', { ascending: false })
        .limit(200); // Берем последние 200 визитов с запасом

      if (selectError) throw selectError;

      // Преобразуем формат для фронтенда, чтобы фронтенд мог сгруппировать их по дням
      // (фронтенд ожидает поля visit_date и unique_visitors)
      const visitsByDay = {};
      
      (data || []).forEach(row => {
        if (!row.visited_at) return;
        // Извлекаем дату в формате DD.MM
        const dateObj = new Date(row.visited_at);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dateKey = `${day}.${month}`;
        
        if (!visitsByDay[dateKey]) {
          visitsByDay[dateKey] = new Set(); // Используем Set для подсчета уникальных IP
        }
        visitsByDay[dateKey].add(row.visitor_ip);
      });

      // Собираем обратно в массив объектов, который ожидает ваш JS на фронтенде
      const formattedData = Object.keys(visitsByDay).map(date => ({
        visit_date: `2026-${date.split('.').reverse().join('-')}T00:00:00Z`, // имитация полной даты для парсинга
        unique_visitors: visitsByDay[date].size
      }));

      return res.status(200).json(formattedData);
    }
  } catch (err) {
    console.error("Supabase API error:", err);
    return res.status(500).json({ error: err.message });
  }
};