import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Настройка CORS (разрешаем запросы с фронтенда)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Переменные окружения Supabase не настроены в Vercel.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Настройка времени (UTC+3, Московское время)
  const now = new Date();
  const userTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
  const today = userTime.toISOString().split('T')[0];
  const timestamp = userTime.toISOString();

  try {
    // 1. МЕТОД GET: Получение количества уникальных визитов за сегодня
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (error) throw error;
      return res.status(200).json(data || { visit_date: today, unique_visitors: 0 });
    }

    // 2. МЕТОД POST: Регистрация нового визита
    if (req.method === 'POST') {
      // Получаем IP-адрес клиента из заголовков Vercel
      const forwarded = req.headers['x-forwarded-for'];
      const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');

      // Вставка сырой записи о посещении (Исправлено: используем visitor_ip вместо ip)
      const { error: insertVisitError } = await supabase
        .from('site_visits')
        .insert([{ visited_at: timestamp, visitor_ip: ip }]);

      if (insertVisitError) {
        console.error('Ошибка вставки в таблицу site_visits:', insertVisitError.message);
      }

      // Обновление или создание строки с общим счетчиком за текущий день
      const { data: existingRecord, error: fetchError } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingRecord) {
        const { data: updateData, error: updateError } = await supabase
          .from('unique_daily_visits')
          .update({ unique_visitors: existingRecord.unique_visitors + 1 })
          .eq('visit_date', today)
          .select()
          .single();

        if (updateError) throw updateError;
        return res.status(200).json(updateData);
      } else {
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