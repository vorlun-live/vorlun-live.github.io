import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Настройка CORS для предотвращения блокировок
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Строго разрешаем только POST-запросы
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Безопасное извлечение IP-адреса клиента
    const ip = req.headers['x-forwarded-for'] || 
               req.socket.remoteAddress || 
               '127.0.0.1';

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Server Environment Variables SUPABASE_URL or SUPABASE_KEY are missing.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const timezoneOffset = -now.getTimezoneOffset();
    const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
    const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
    const offsetSign = timezoneOffset >= 0 ? '+' : '-';
    
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateOnlyStr = `${yyyy}-${mm}-${dd}T00:00:00${offsetSign}${offsetHours}:${offsetMinutes}`;

    const todayStart = `${yyyy}-${mm}-${dd}T00:00:00Z`;
    const todayEnd = `${yyyy}-${mm}-${dd}T23:59:59Z`;

    // Поиск визита с таким же IP за текущие сутки
    const { data: existingVisits, error: selectError } = await supabase
      .from('site_visits')
      .select('id')
      .eq('ip', ip)
      .gte('visited_at', todayStart)
      .lte('visited_at', todayEnd);

    if (selectError) {
      throw new Error(`Supabase select error: ${selectError.message}`);
    }

    // Если записей за сегодня нет — фиксируем визит и его IP
    if (!existingVisits || existingVisits.length === 0) {
      const { error: insertError } = await supabase
        .from('site_visits')
        .insert([{ visited_at: dateOnlyStr, ip: ip }]);

      if (insertError) {
        throw new Error(`Supabase insert error: ${insertError.message}`);
      }

      return res.status(200).json({ success: true, message: 'Visit successfully recorded with IP.' });
    }

    return res.status(200).json({ success: true, message: 'Visit is already counted for this IP today.' });

  } catch (error) {
    console.error('API /visit error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}