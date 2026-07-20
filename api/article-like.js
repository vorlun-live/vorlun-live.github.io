import { supabase, configError } from './_supabaseClient.js';
import { VALID_ARTICLE_IDS } from './_validArticleIds.js';
import { getAuthenticatedUser } from './_auth.js';
import { syncAchievements } from './_achievements.js';

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
    return res.status(401).json({ error: 'Нужно войти в аккаунт с подтверждённой почтой, чтобы оценивать статьи' });
  }

  const { articleId, voteType } = req.body || {};

  if (typeof articleId !== 'string' || !VALID_ARTICLE_IDS.has(articleId)) {
    return res.status(400).json({ error: 'Неизвестный articleId' });
  }

  if (voteType !== 'like' && voteType !== 'dislike') {
    return res.status(400).json({ error: 'voteType должен быть "like" или "dislike"' });
  }

  try {
    // Смотрим, есть ли уже голос этого пользователя за эту статью
    const { data: existingVote, error: fetchError } = await supabase
      .from('article_votes')
      .select('vote_type')
      .eq('article_id', articleId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;

    let userVote = voteType;

    if (existingVote && existingVote.vote_type === voteType) {
      // Повторный клик по уже выбранному варианту — снимаем голос (тоггл)
      const { error: deleteError } = await supabase
        .from('article_votes')
        .delete()
        .eq('article_id', articleId)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;
      userVote = null;
    } else {
      // Новый голос или смена голоса (like -> dislike и наоборот) — upsert перезаписывает
      const { error: upsertError } = await supabase
        .from('article_votes')
        .upsert(
          { article_id: articleId, user_id: user.id, vote_type: voteType },
          { onConflict: 'article_id,user_id' }
        );

      if (upsertError) throw upsertError;
    }

    const { data: counts, error: countsError } = await supabase
      .from('article_vote_counts')
      .select('likes, dislikes')
      .eq('article_id', articleId)
      .maybeSingle();

    if (countsError) throw countsError;

    const { newlyUnlocked } = await syncAchievements(user.id);

    return res.status(200).json({
      success: true,
      likes: counts?.likes || 0,
      dislikes: counts?.dislikes || 0,
      userVote,
      newlyUnlocked,
    });
  } catch (err) {
    console.error('Ошибка при записи голоса:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
