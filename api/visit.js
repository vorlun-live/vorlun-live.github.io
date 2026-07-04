import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase через переменные окружения Vercel
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
    // 1. ЛОГИКА GET: Отдаем фронтенду текущее число уникальных визитов за сегодня
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (error) throw error;

      return res.status(200).json(data || { visit_date: today, unique_visitors: 0 });
    }

    // 2. ЛОГИКА POST: Фиксируем новый визит (с защитой от накрутки)
    if (req.method === 'POST') {
      // Получаем реальный IP-адрес пользователя, зашедшего на сайт
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      // Проверяем, логировался ли этот IP уже сегодня в таблице site_visits
      const { data: ipCheck, error: ipCheckError } = await supabase
        .from('site_visits')
        .select('id')
        .eq('ip', ip)
        .gte('visited_at', today + 'T00:00:00.000Z')
        .lte('visited_at', today + 'T23:59:59.999Z')
        .limit(1);

      if (ipCheckError) throw ipCheckError;

      // ЗАЩИТА: Если этот IP уже заходил сегодня, просто возвращаем текущую статистику (не увеличивая счетчик)
      if (ipCheck && ipCheck.length > 0) {
        const { data: currentRecord } = await supabase
          .from('unique_daily_visits')
          .select('*')
          .eq('visit_date', today)
          .maybeSingle();

        return res.status(200).json(currentRecord || { visit_date: today, unique_visitors: 1 });
      }

      // Если IP новый, записываем его в таблицу site_visits
      const { error: insertVisitError } = await supabase
        .from('site_visits')
        .insert([{ visited_at: timestamp, ip: ip }]);

      if (insertVisitError) {
        console.error('Ошибка записи в таблицу site_visits:', insertVisitError.message);
      }

      // Проверяем, создана ли уже строка агрегатора для сегодняшнего дня
      const { data: existingRecord, error: fetchError } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingRecord) {
        // Запись на сегодня есть — инкрементируем уникального посетителя (+1)
        const { data: updateData, error: updateError } = await supabase
          .from('unique_daily_visits')
          .update({ unique_visitors: existingRecord.unique_visitors + 1 })
          .eq('visit_date', today)
          .select()
          .single();

        if (updateError) throw updateError;
        return res.status(200).json(updateData);
      } else {
        // Записи на сегодня еще нет — создаем её со значением 1
        const { data: insertData, error: insertError } = await supabase
          .from('unique_daily_visits')
          .insert([{ visit_date: today, unique_visitors: 1 }])
          .select()
          .single();

        if (insertError) throw insertError;
        return res.status(200).json(insertData);
      }
    }

    return res.status(405).json({ error: 'Метод не поддерживается' });
  } catch (err) {
    console.error('Ошибка в обработчике API визитов:', err.message);
    return res.status(500).json({ error: err.message });
  }
}