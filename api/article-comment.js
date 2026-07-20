import { supabase, configError } from './_supabaseClient.js';
import { VALID_ARTICLE_IDS } from './_validArticleIds.js';
import { containsBannedContent } from './_moderation.js';
import { getAuthenticatedUser } from './_auth.js';
import { syncAchievements } from './_achievements.js';

const MAX_COMMENT_LENGTH = 1000;
const COMMENTS_PER_PAGE = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (configError) {
    return res.status(500).json({ error: 'Сервер не настроен', details: configError });
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
}

// Чтение комментариев остаётся публичным — читать может кто угодно,
// писать могут только вошедшие с подтверждённой почтой.
async function handleGet(req, res) {
  const { articleId } = req.query;

  if (typeof articleId !== 'string' || !VALID_ARTICLE_IDS.has(articleId)) {
    return res.status(400).json({ error: 'Неизвестный articleId' });
  }

  try {
    const { data, error } = await supabase
      .from('article_comments')
      .select('id, name, comment, created_at')
      .eq('article_id', articleId)
      .order('created_at', { ascending: false })
      .limit(COMMENTS_PER_PAGE);

    if (error) throw error;

    return res.status(200).json({ comments: data || [] });
  } catch (err) {
    console.error('Ошибка при чтении комментариев:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}

async function handlePost(req, res) {
  const { articleId, comment, website } = req.body || {};

  // Honeypot: обычный человек это поле не видит и не заполняет, боты часто
  // автоматически проставляют значения во все поля формы подряд.
  if (website) {
    return res.status(200).json({ success: true });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Нужно войти в аккаунт с подтверждённой почтой, чтобы комментировать' });
  }

  if (typeof articleId !== 'string' || !VALID_ARTICLE_IDS.has(articleId)) {
    return res.status(400).json({ error: 'Неизвестный articleId' });
  }

  const trimmedComment = typeof comment === 'string' ? comment.trim() : '';

  if (!trimmedComment || trimmedComment.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Комментарий должен быть от 1 до ${MAX_COMMENT_LENGTH} символов` });
  }

  if (containsBannedContent(trimmedComment)) {
    return res.status(400).json({ error: 'Комментарий содержит недопустимые слова. Отредактируйте текст и попробуйте снова.' });
  }

  try {
    // Имя берём из профиля пользователя (не из формы) — иначе можно было бы
    // выдать себя за кого угодно, просто вписав другое имя в поле.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const displayName = profile?.display_name || user.email.split('@')[0];

    const { data, error } = await supabase
      .from('article_comments')
      .insert([{ article_id: articleId, user_id: user.id, name: displayName, comment: trimmedComment }])
      .select()
      .single();

    if (error) throw error;

    const { newlyUnlocked } = await syncAchievements(user.id);

    return res.status(201).json({ success: true, comment: data, newlyUnlocked });
  } catch (err) {
    console.error('Ошибка при записи комментария:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
