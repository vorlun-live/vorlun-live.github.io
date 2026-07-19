import { supabase, configError } from './_supabaseClient.js';
import { VALID_ARTICLE_IDS } from './_validArticleIds.js';

const MAX_NAME_LENGTH = 50;
const MAX_COMMENT_LENGTH = 1000;
const COMMENTS_PER_PAGE = 50;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
  const { articleId, name, comment, website } = req.body || {};

  // Honeypot: обычный человек это поле не видит и не заполняет, боты часто
  // автоматически проставляют значения во все поля формы подряд.
  // Отвечаем успехом, но ничего не сохраняем — так бот не понимает, что его отсеяли.
  if (website) {
    return res.status(200).json({ success: true });
  }

  if (typeof articleId !== 'string' || !VALID_ARTICLE_IDS.has(articleId)) {
    return res.status(400).json({ error: 'Неизвестный articleId' });
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedComment = typeof comment === 'string' ? comment.trim() : '';

  if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Имя должно быть от 1 до ${MAX_NAME_LENGTH} символов` });
  }

  if (!trimmedComment || trimmedComment.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Комментарий должен быть от 1 до ${MAX_COMMENT_LENGTH} символов` });
  }

  try {
    const { data, error } = await supabase
      .from('article_comments')
      .insert([{ article_id: articleId, name: trimmedName, comment: trimmedComment }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, comment: data });
  } catch (err) {
    console.error('Ошибка при записи комментария:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
