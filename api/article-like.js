import { supabase, configError } from './_supabaseClient.js';
import { VALID_ARTICLE_IDS } from './_validArticleIds.js';

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

  const { articleId, voteType } = req.body || {};

  if (typeof articleId !== 'string' || !VALID_ARTICLE_IDS.has(articleId)) {
    return res.status(400).json({ error: 'Неизвестный articleId' });
  }

  // По умолчанию 'like' — для обратной совместимости со старыми клиентами,
  // которые ещё не знают про дизлайки.
  const normalizedVoteType = voteType === 'dislike' ? 'dislike' : 'like';
  const column = normalizedVoteType === 'dislike' ? 'dislikes' : 'likes';

  try {
    // Пытаемся атомарно увеличить существующий счётчик через RPC было бы надёжнее при
    // высокой конкурентности, но для масштаба одного блога достаточно read-modify-write:
    // сначала читаем текущие значения, затем записываем нужный столбец +1.
    const { data: existing, error: fetchError } = await supabase
      .from('article_likes')
      .select('likes, dislikes')
      .eq('article_id', articleId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const nextLikes = column === 'likes' ? (existing?.likes || 0) + 1 : (existing?.likes || 0);
    const nextDislikes = column === 'dislikes' ? (existing?.dislikes || 0) + 1 : (existing?.dislikes || 0);

    const { error: upsertError } = await supabase
      .from('article_likes')
      .upsert({ article_id: articleId, likes: nextLikes, dislikes: nextDislikes }, { onConflict: 'article_id' });

    if (upsertError) throw upsertError;

    return res.status(200).json({ success: true, likes: nextLikes, dislikes: nextDislikes });
  } catch (err) {
    console.error('Ошибка при записи голоса:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
