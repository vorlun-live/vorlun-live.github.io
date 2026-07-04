import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase клиента с использованием переменных окружения Vercel
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Настройка CORS заголовков для безопасного обращения с любого фронтенда (например, GitHub Pages)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Обработка Preflight-запросов браузера перед POST
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. РЕГИСТРАЦИЯ ВИЗИТА (POST)
  if (req.method === 'POST') {
    try {
      // Vercel автоматически прокидывает IP пользователя в заголовки
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      const { data, error } = await supabase
        .from('site_visits')
        .insert([{ visitor_ip: ip, visited_at: new Date().toISOString() }]);

      if (error) throw error;

      return res.status(200).json({ success: true, message: "Visit registered" });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 2. ПОЛУЧЕНИЕ СЧЕТЧИКА УНИКАЛЬНЫХ ЗА СЕГОДНЯ (GET)
  if (req.method === 'GET') {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('site_visits')
        .select('visitor_ip')
        .gte('visited_at', today.toISOString());

      if (error) throw error;

      // Считаем количество строго уникальных IP-адресов
      const uniqueIPs = new Set(data.map(v => v.visitor_ip));

      return res.status(200).json({ unique_visitors: uniqueIPs.size });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Защита от вызова неподдерживаемых сервером методов
  return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
}