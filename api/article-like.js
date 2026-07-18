import { supabase, configError } from './_supabaseClient.js';

// Белый список допустимых id статей — защита от произвольной записи в таблицу
// (без него кто угодно мог бы прислать любую строку в качестве article_id).
// Список должен совпадать с массивом ARTICLES в index.html.
const VALID_ARTICLE_IDS = new Set([
  'obs-guide',
  'audio-guide',
  'donates-guide',
  'tiktok-guide',
  'camera-guide',
  'twitch-panel-guide',
  'streamdeck-guide',
  'obs-vs-streamlabs-guide',
  'discord-guide',
  'collab-guide',
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

  const { articleId } = req.body || {};

  if (typeof articleId !== 'string' || !VALID_ARTICLE_IDS.has(articleId)) {
    return res.status(400).json({ error: 'Неизвестный articleId' });
  }

  try {
    // Пытаемся атомарно увеличить существующий счётчик через RPC было бы надёжнее при
    // высокой конкурентности, но для масштаба одного блога достаточно read-modify-write:
    // сначала читаем текущее значение, затем записываем +1.
    const { data: existing, error: fetchError } = await supabase
      .from('article_likes')
      .select('likes')
      .eq('article_id', articleId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const nextCount = (existing?.likes || 0) + 1;

    const { error: upsertError } = await supabase
      .from('article_likes')
      .upsert({ article_id: articleId, likes: nextCount }, { onConflict: 'article_id' });

    if (upsertError) throw upsertError;

    return res.status(200).json({ success: true, likes: nextCount });
  } catch (err) {
    console.error('Ошибка при записи лайка:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
