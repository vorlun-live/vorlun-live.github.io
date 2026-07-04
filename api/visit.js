import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Настройка CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Используем чистую текущую дату сервера для фильтрации (без ручных сдвигов)
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    // 1. ЛОГИКА GET: Считаем уникальные IP за текущие сутки
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('site_visits')
        .select('visitor_ip')
        .gte('visited_at', todayStr); // База сама поймет всё, что позже начала сегодняшнего дня

      if (error) throw error;

      const uniqueIPs = new Set(data?.map(item => item.visitor_ip) || []);
      return res.status(200).json({ views: uniqueIPs.size });
    }

    // 2. ЛОГИКА POST: Запись визита
    if (req.method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      // Проверяем, был ли этот IP сегодня
      const { data: ipCheck, error: ipCheckError } = await supabase
        .from('site_visits')
        .select('id')
        .eq('visitor_ip', ip)
        .gte('visited_at', todayStr)
        .limit(1);

      if (ipCheckError) throw ipCheckError;

      // Если IP новый за сегодня — просто делаем вставку. 
      // Мы НЕ передаем visited_at, чтобы Supabase использовал свое стандартное значение (NOW() / CURRENT_TIMESTAMP)
      if (!ipCheck || ipCheck.length === 0) {
        const { error: insertVisitError } = await supabase
          .from('site_visits')
          .insert([{ visitor_ip: ip }]);

        if (insertVisitError) throw insertVisitError;
      }

      // Считаем итоговое количество для мгновенного ответа
      const { data: allVisitsToday } = await supabase
        .from('site_visits')
        .select('visitor_ip')
        .gte('visited_at', todayStr);

      const uniqueIPs = new Set(allVisitsToday?.map(item => item.visitor_ip) || []);
      return res.status(200).json({ views: uniqueIPs.size });
    }

    return res.status(405).json({ error: 'Метод не поддерживается' });
  } catch (err) {
    console.error('Критический сбой API визитов:', err.message);
    return res.status(500).json({ error: err.message });
  }
}