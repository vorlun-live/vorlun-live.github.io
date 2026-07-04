import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Настройка CORS заголовков
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Получаем текущую дату в формате YYYY-MM-DD для часового пояса МСК (UTC+3)
  const now = new Date();
  const userTime = new Date(now.getTime() + (3 * 60 * 60 * 1000)); 
  const today = userTime.toISOString().split('T')[0];
  const timestamp = userTime.toISOString();

  try {
    // 1. ЛОГИКА GET: Читаем данные из View (unique_daily_visits)
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('created_at', today)
        .maybeSingle();

      if (error) throw error;

      return res.status(200).json(data || { created_at: today, views: 0 });
    }

    // 2. ЛОГИКА POST: Добавляем новый IP в таблицу site_visits
    if (req.method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      // Проверка по точным колонкам 'visited_at' и 'visitor_ip'
      const { data: ipCheck, error: ipCheckError } = await supabase
        .from('site_visits')
        .select('id')
        .eq('visitor_ip', ip)
        .gte('visited_at', today + 'T00:00:00.000Z')
        .lte('visited_at', today + 'T23:59:59.999Z')
        .limit(1);

      if (ipCheckError) throw ipCheckError;

      // Если IP сегодня еще не было — делаем вставку в правильные колонки visited_at и visitor_ip
      if (!ipCheck || ipCheck.length === 0) {
        const { error: insertVisitError } = await supabase
          .from('site_visits')
          .insert([{ visited_at: timestamp, visitor_ip: ip }]);

        if (insertVisitError) throw insertVisitError;
      }

      // Запрашиваем актуальное значение из View, чтобы вернуть клиенту
      const { data: updatedView } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('created_at', today)
        .maybeSingle();

      return res.status(200).json(updatedView || { created_at: today, views: 1 });
    }

    return res.status(405).json({ error: 'Метод не поддерживается' });
  } catch (err) {
    console.error('Ошибка в бэкенд-обработчике API:', err.message);
    return res.status(500).json({ error: err.message });
  }
}