import { createClient } from '@supabase/supabase-js';

// Общая инициализация серверного клиента Supabase с SERVICE_ROLE_KEY (обходит RLS).
// Переменные окружения задаются ТОЛЬКО в Vercel Project Settings → Environment Variables.
//
// ВАЖНО: после добавления/изменения переменных окружения в Vercel нужен новый деплой —
// уже запущенные функции их не подхватывают "на лету".
//
// Файл начинается с "_", поэтому Vercel не создаёт из него отдельный HTTP-роут —
// это просто общий код для api/visit.js и api/article-like.js.

/**
 * Убирает случайно попавшие при копировании кавычки, пробелы и переносы строк
 * вокруг значения переменной окружения — частая причина ошибки
 * "Invalid path specified in request URL" при создании клиента Supabase.
 */
function normalizeEnvValue(rawValue) {
  if (!rawValue) return '';
  return rawValue.trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Достаёт "чистый" origin (протокол+домен, без пути) из значения SUPABASE_URL.
 * Устойчиво к частой ошибке копирования — когда вместо базового URL проекта
 * (https://<project>.supabase.co) в переменную попадает полный REST-эндпоинт
 * (https://<project>.supabase.co/rest/v1/) или лишний слэш/пробел на конце.
 */
function extractSupabaseOrigin(rawUrl) {
  const normalized = normalizeEnvValue(rawUrl);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
    return parsed.origin; // отбрасывает любой /path, ?query, завершающий слэш
  } catch {
    return null; // строка вообще не похожа на URL (нет протокола и т.п.)
  }
}

const supabaseUrl = extractSupabaseOrigin(process.env.SUPABASE_URL);
const supabaseServiceKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

export let supabase = null;
export let configError = null;

if (!supabaseUrl || !supabaseServiceKey) {
  configError = 'Не заданы SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в переменных окружения Vercel, либо SUPABASE_URL не удалось распознать как URL';
} else {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
}

// Диагностика в Vercel Runtime Logs без утечки самого секрета
if (configError) {
  const rawLength = normalizeEnvValue(process.env.SUPABASE_URL).length;
  console.error(
    `[_supabaseClient.js] Ошибка конфигурации: ${configError}. ` +
    `SUPABASE_URL исходная длина=${rawLength}, распознан как=${supabaseUrl || 'не распознан'}. ` +
    `SUPABASE_SERVICE_ROLE_KEY задан: ${Boolean(supabaseServiceKey)}, длина=${supabaseServiceKey.length}.`
  );
}
