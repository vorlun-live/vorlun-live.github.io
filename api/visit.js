import { createClient } from '@supabase/supabase-js';

// Инициализация клиента Supabase с использованием переменных окружения Vercel
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // Разрешаем CORS для любых доменов (чтобы не было проблем с fetch с GitHub Pages / Vercel)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Получаем сегодняшнюю дату в формате YYYY-MM-DD (только дату, без времени)
  const today = new Date().toISOString().split('T')[0];

  try {
    if (req.method === 'GET') {
      // Логика получения данных: суммируем уникальных посетителей или отдаем записи
      const { data, error } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (error) throw error;

      return res.status(200).json(data || { visit_date: today, unique_visitors: 0 });
    }

    if (req.method === 'POST') {
      // Сначала проверяем, есть ли запись за сегодня
      const { data: existingRecord, error: fetchError } = await supabase
        .from('unique_daily_visits')
        .select('*')
        .eq('visit_date', today)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingRecord) {
        // Если запись есть — обновляем (инкрементируем счетчик на 1)
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