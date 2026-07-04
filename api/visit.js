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

  // Получаем текущую дату в формате YYYY-MM-DD для МСК (UTC+3)
  const now = new Date();
  const userTime = new Date(now.getTime() + (3 * 60 * 60 * 1000)); 
  const today = userTime.toISOString().split('T')[0];
  const timestamp = userTime.toISOString();

  try {
    // 1. ЛОГИКА GET: Отдаем фронтенду число визитов из колонки 'views'
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('created_at', today)
        .maybeSingle();

      if (error) throw error;

      return res.status(200).json(data || { created_at: today, views: 0 });
    }

    // 2. ЛОГИКА POST: Фиксируем визит с защитой от накрутки
    if (req.method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      // Проверяем по колонке 'create_at', заходил ли этот IP сегодня
      const { data: ipCheck, error: ipCheckError } = await supabase
        .from('site_visits')
        .select('id')
        .eq('ip', ip)
        .gte('create_at', today + 'T00:00:00.000Z')
        .lte('create_at', today + 'T23:59:59.999Z')
        .limit(1);

      if (ipCheckError) throw ipCheckError;

      // ЗАЩИТА: Если IP уже был сегодня, не увеличиваем счетчик, просто отдаем текущую инфу
      if (ipCheck && ipCheck.length > 0) {
        const { data: currentRecord } = await supabase
          .from('unique_daily_visits')
          .select('*')
          .eq('created_at', today)
          .maybeSingle();

        return res.status(200).json(currentRecord || { created_at: today, views: 1 });
      }

      // Если IP новый — записываем его в site_visits (в колонку 'create_at')
      const { error: insertVisitError } = await supabase
        .from('site_visits')
        .insert([{ create_at: timestamp, ip: ip }]);

      if (insertVisitError) throw insertVisitError;

      // Проверяем, есть ли уже строка для сегодняшнего дня в unique_daily_visits
      const { data: existingRecord, error: fetchError } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('created_at', today)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingRecord) {
        // Строка есть — увеличиваем значение в колонке 'views' на 1
        const { data: updateData, error: updateError } = await supabase
          .from('unique_daily_visits')
          .update({ views: existingRecord.views + 1 })
          .eq('created_at', today)
          .select()
          .single();

        if (updateError) throw updateError;
        return res.status(200).json(updateData);
      } else {
        // Строки нет — создаем новую со значением views = 1
        const { data: insertData, error: insertError } = await supabase
          .from('unique_daily_visits')
          .insert([{ created_at: today, views: 1 }])
          .select()
          .single();

        if (insertError) throw insertError;
        return res.status(200).json(insertData);
      }
    }

    return res.status(405).json({ error: 'Метод не поддерживается' });
  } catch (err) {
    console.error('Ошибка в обработчике API:', err.message);
    return res.status(500).json({ error: err.message });
  }
}