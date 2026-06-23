import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Server Environment Variables SUPABASE_URL or SUPABASE_KEY are missing.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Принудительно используем корректную ISO-дату без сдвигов часовых поясов, чтобы избежать конфликтов валидации в Supabase
    const now = new Date().toISOString(); 

    console.log('Попытка записи визита. IP:', ip, 'Дата:', now);

    // Упрощенная вставка: напрямую добавляем запись в таблицу, не выполняя предварительный SELECT, 
    // чтобы исключить ошибку падения при запросе или фильтрации по дате
    const { error: insertError } = await supabase
      .from('site_visits')
      .insert([{ visited_at: now, ip: ip }]);

    if (insertError) {
      throw new Error(`Supabase insert error: ${insertError.message}`);
    }

    return res.status(200).json({ success: true, message: 'Visit successfully recorded with IP.' });

  } catch (error) {
    console.error('API /visit error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}