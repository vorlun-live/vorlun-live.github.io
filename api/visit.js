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
    // 1. ЛОГИКА GET: Безопасное чтение данных из View (unique_daily_visits)
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('*');

      if (error) throw error;

      // Ищем строку за сегодня, проверяя любые текстовые поля на совпадение с YYYY-MM-DD
      const todayRow = data?.find(row => 
        Object.values(row).some(val => String(val).startsWith(today))
      );

      // Если нашли строку — отдаем её, если нет — берем первую попавшуюся или 0
      const viewsCount = todayRow ? (todayRow.views ?? 0) : (data?.[0]?.views ?? 0);

      return res.status(200).json({ views: viewsCount });
    }

    // 2. ЛОГИКА POST: Добавляем новый IP в таблицу site_visits
    if (req.method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      // Проверяем, заходил ли этот IP сегодня (по колонкам visited_at и visitor_ip)
      const { data: ipCheck, error: ipCheckError } = await supabase
        .from('site_visits')
        .select('id')
        .eq('visitor_ip', ip)
        .gte('visited_at', today + 'T00:00:00.000Z')
        .lte('visited_at', today + 'T23:59:59.999Z')
        .limit(1);

      if (ipCheckError) throw ipCheckError;

      // Если IP новый — вставляем строку
      if (!ipCheck || ipCheck.length === 0) {
        const { error: insertVisitError } = await supabase
          .from('site_visits')
          .insert([{ visited_at: timestamp, visitor_ip: ip }]);

        if (insertVisitError) throw insertVisitError;
      }

      // Запрашиваем актуальные данные для ответа
      const { data: finalData } = await supabase
        .from('unique_daily_visits')
        .select('*');

      const todayRow = finalData?.find(row => 
        Object.values(row).some(val => String(val).startsWith(today))
      );
      const viewsCount = todayRow ? (todayRow.views ?? 0) : (finalData?.[0]?.views ?? 1);

      return res.status(200).json({ views: viewsCount });
    }

    return res.status(405).json({ error: 'Метод не поддерживается' });
  } catch (err) {
    console.error('Ошибка в бэкенд-обработчике API:', err.message);
    return res.status(500).json({ error: err.message });
  }
}