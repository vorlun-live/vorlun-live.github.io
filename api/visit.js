import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase (убедитесь, что переменные добавлены в Vercel Dashboard)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // или ANON_KEY, если настроены RLS
);

export default async function handler(req, res) {
  // Настройка CORS заголовков (если фронтенд лежит на другом домене, например GitHub Pages)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Обработка Preflight-запросов браузера
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. ОБРАБОТКА МЕТОДА POST (Регистрация визита)
  if (req.method === 'POST') {
    try {
      // Получаем реальный IP-адрес пользователя, который Vercel автоматически добавляет в заголовки
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      // Пример записи в Supabase (подставьте вашу структуру таблицы)
      const { data, error } = await supabase
        .from('visits') 
        .insert([{ visitor_ip: ip, visited_at: new Date() }]);

      if (error) throw error;

      return res.status(200).json({ success: true, message: "Visit registered" });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 2. ОБРАБОТКА МЕТОДА GET (Получение количества уникальных за сегодня)
  if (req.method === 'GET') {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Запрос в Supabase: считаем уникальные IP за сегодня
      const { data, error, count } = await supabase
        .from('visits')
        .select('visitor_ip', { count: 'exact', head: false })
        .gte('visited_at', today.toISOString());

      if (error) throw error;

      // Выделяем только уникальные IP
      const uniqueIPs = new Set(data.map(v => v.visitor_ip));

      return res.status(200).json({ unique_visitors: uniqueIPs.size });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Если пришел другой метод (например, PUT или DELETE)
  return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
}