import { supabase, configError } from './_supabaseClient.js';
import { containsBannedContent } from './_moderation.js';
import { getAuthenticatedUser } from './_auth.js';

const MAX_NAME_LENGTH = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  if (configError) {
    return res.status(500).json({ error: 'Сервер не настроен', details: configError });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Нужно войти в аккаунт с подтверждённой почтой' });
  }

  const { displayName } = req.body || {};
  const trimmedName = typeof displayName === 'string' ? displayName.trim() : '';

  if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Имя должно быть от 1 до ${MAX_NAME_LENGTH} символов` });
  }

  if (containsBannedContent(trimmedName)) {
    return res.status(400).json({ error: 'Это имя недопустимо. Выберите другое.' });
  }

  try {
    // Регистронезависимая проверка на занятость — до записи, для дружелюбного сообщения.
    // Финальную гарантию всё равно даёт уникальный индекс в базе (на случай гонки запросов).
    const { data: existing, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('display_name', trimmedName)
      .neq('id', user.id)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existing) {
      return res.status(409).json({ error: 'Это имя уже занято, выберите другое.' });
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: trimmedName })
      .eq('id', user.id);

    if (updateError) {
      // 23505 — нарушение уникального индекса (сработало на гонке запросов, редкий случай)
      if (updateError.code === '23505') {
        return res.status(409).json({ error: 'Это имя уже занято, выберите другое.' });
      }
      throw updateError;
    }

    return res.status(200).json({ success: true, displayName: trimmedName });
  } catch (err) {
    console.error('Ошибка при смене имени:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
