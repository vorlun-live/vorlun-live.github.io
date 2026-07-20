import { supabase } from './_supabaseClient.js';

// Единый источник правды по условиям значков. Иконки/подписи для отображения
// дублируются на фронтенде в index.html (ACHIEVEMENTS) — при добавлении нового
// значка нужно поправить оба места.
export const ACHIEVEMENT_RULES = [
  { id: 'first_vote', check: s => s.votes >= 1 },
  { id: 'first_comment', check: s => s.comments >= 1 },
  { id: 'active_voter', check: s => s.votes >= 5 },
  { id: 'regular_author', check: s => s.comments >= 3 },
  { id: 'legend', check: s => s.votes >= 10 && s.comments >= 5 },
];

// Считаем статистику "на лету" прямо из первичных таблиц (голоса/комментарии),
// а не храним отдельный денормализованный счётчик — меньше мест, где данные
// могут разойтись между собой.
export async function getUserStats(userId) {
  const [votesResult, commentsResult] = await Promise.all([
    supabase.from('article_votes').select('article_id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('article_comments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  return {
    votes: votesResult.count || 0,
    comments: commentsResult.count || 0,
  };
}

/**
 * Пересчитывает статистику пользователя и выдаёт новые значки, если условия выполнены.
 * Возвращает { stats, newlyUnlocked } — newlyUnlocked нужен фронтенду, чтобы показать тост
 * сразу после действия, без дополнительного запроса.
 */
export async function syncAchievements(userId) {
  const stats = await getUserStats(userId);

  const { data: existing, error: fetchError } = await supabase
    .from('user_achievements')
    .select('achievement_id')
    .eq('user_id', userId);

  if (fetchError) throw fetchError;

  const unlockedIds = new Set((existing || []).map(r => r.achievement_id));
  const newlyUnlocked = ACHIEVEMENT_RULES
    .filter(rule => !unlockedIds.has(rule.id) && rule.check(stats))
    .map(rule => rule.id);

  if (newlyUnlocked.length > 0) {
    const { error: insertError } = await supabase
      .from('user_achievements')
      .insert(newlyUnlocked.map(id => ({ user_id: userId, achievement_id: id })));

    if (insertError) throw insertError;
  }

  return { stats, newlyUnlocked };
}
