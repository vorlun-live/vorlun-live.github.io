import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Настройка CORS
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
    return res.status(500).json({ error: 'Supabase env variables are not configured.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const now = new Date();
  const userTime = new Date(now.getTime() + (3 * 60 * 60 * 1000)); // UTC+3
  const today = userTime.toISOString().split('T')[0];

  try {
    // GET запрос: получение статистики
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (error) throw error;
      return res.status(200).json(data || { visit_date: today, unique_visitors: 0 });
    }

    // POST запрос: фиксация визита
    if (req.method === 'POST') {
      // Улучшенный захват IP-адреса
      const rawIp = req.headers['x-forwarded-for'] || 
                    req.headers['x-real-ip'] || 
                    (req.socket ? req.socket.remoteAddress : null) || 
                    '127.0.0.1';
      
      const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp[0];
      
      console.log('Detected IP:', ip);
      console.log('Request headers:', JSON.stringify(req.headers));

      const timestamp = now.toISOString();
      
      // Вставка визита
      const { error: insertVisitError } = await supabase
        .from('site_visits')
        .insert([{ visited_at: timestamp, ip: ip }]);

      if (insertVisitError) {
        console.error('Ошибка вставки визита в таблицу site_visits:', insertVisitError.message);
      }

      // Обновление/создание записи уникальных визитов
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
    console.error('Ошибка в API функции:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}