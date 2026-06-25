import { createClient } from '@supabase/supabase-js';

// Инициализация клиента Supabase с использованием переменных окружения Vercel
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Разрешаем CORS для любых доменов
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Определяем точное время вызова и приводим дату к часовому поясу UTC+3
  const now = new Date();
  const userTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
  const today = userTime.toISOString().split('T')[0];

  try {
    // GET: получение записей счетчика уникальных визитов за день
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (error) throw error;

      return res.status(200).json(data || { visit_date: today, unique_visitors: 0 });
    }

    // POST: фиксация визита (запись IP и обновление счетчика)
    if (req.method === 'POST') {
      // 1. Извлекаем реальный IP-адрес с учетом прокси Vercel
      const rawIp = req.headers['x-forwarded-for'];
      const ip = rawIp ? rawIp.split(',')[0].trim() : (req.socket?.remoteAddress || '127.0.0.1');

      // 2. Добавляем запись с IP-адресом в таблицу истории визитов site_visits
      const timestamp = now.toISOString(); // Время визита оставляем в формате UTC, чтобы не было путаницы
      const { error: insertVisitError } = await supabase
        .from('site_visits')
        .insert([{ visited_at: timestamp, ip: ip }]);

      if (insertVisitError) {
        console.error('Ошибка вставки визита в таблицу site_visits:', insertVisitError.message);
        throw insertVisitError;
      }

      // 3. Логика счетчика уникальных визитов за день (unique_daily_visits)
      const { data: existingRecord, error: fetchError } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingRecord) {
        // Если запись за сегодня есть — инкрементируем счетчик на 1
        const { data: updateData, error: updateError } = await supabase
          .from('unique_daily_visits')
          .update({ unique_visitors: existingRecord.unique_visitors + 1 })
          .eq('visit_date', today)
          .select()
          .single();

        if (updateError) throw updateError;
        return res.status(200).json(updateData);
      } else {
        // Если записи нет — создаем новую со значением 1
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
    console.error('Ошибка в API функции:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}