import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const now = new Date();
  const userTime = new Date(now.getTime() + (3 * 60 * 60 * 1000)); 
  const today = userTime.toISOString().split('T')[0];
  const timestamp = userTime.toISOString();

  try {
    // 1. ЛОГИКА GET: Считаем уникальные IP за сегодня прямо из таблицы site_visits
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('site_visits')
        .select('visitor_ip')
        .gte('visited_at', today + 'T00:00:00.000Z')
        .lte('visited_at', today + 'T23:59:59.999Z');

      if (error) throw error;

      const uniqueIPs = new Set(data?.map(item => item.visitor_ip) || []);
      return res.status(200).json({ views: uniqueIPs.size });
    }

    // 2. ЛОГИКА POST: Запись визита с проверкой дублей
    if (req.method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      const { data: ipCheck, error: ipCheckError } = await supabase
        .from('site_visits')
        .select('id')
        .eq('visitor_ip', ip)
        .gte('visited_at', today + 'T00:00:00.000Z')
        .lte('visited_at', today + 'T23:59:59.999Z')
        .limit(1);

      if (ipCheckError) throw ipCheckError;

      if (!ipCheck || ipCheck.length === 0) {
        const { error: insertVisitError } = await supabase
          .from('site_visits')
          .insert([{ visited_at: timestamp, visitor_ip: ip }]);

        if (insertVisitError) throw insertVisitError;
      }

      const { data: allVisitsToday } = await supabase
        .from('site_visits')
        .select('visitor_ip')
        .gte('visited_at', today + 'T00:00:00.000Z')
        .lte('visited_at', today + 'T23:59:59.999Z');

      const uniqueIPs = new Set(allVisitsToday?.map(item => item.visitor_ip) || []);
      return res.status(200).json({ views: uniqueIPs.size });
    }

    return res.status(405).json({ error: 'Метод не поддерживается' });
  } catch (err) {
    console.error('Критический сбой API визитов:', err.message);
    return res.status(500).json({ error: err.message });
  }
}