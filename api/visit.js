import { supabase, configError } from './_supabaseClient.js';

// ВАЖНО: после добавления/изменения переменных окружения в Vercel нужен новый деплой —
// уже запущенные функции их не подхватывают "на лету".

// Грубая валидация формата IPv4/IPv6 — чтобы не писать в базу произвольный мусор,
// если заголовок будет подделан или придёт в неожиданном виде.
const IP_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+$/;

/**
 * Извлекает реальный IP посетителя из заголовков прокси Vercel.
 * x-forwarded-for может содержать цепочку "клиент, прокси1, прокси2" —
 * нам нужен первый (самый левый) адрес.
 */
function extractClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const rawCandidate = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const candidate = (rawCandidate || '').split(',')[0].trim();

  if (candidate && IP_PATTERN.test(candidate)) {
    return candidate;
  }

  // Фолбэк на IP сокета (за прокси Vercel обычно недоступен, но проверяем на всякий случай)
  const socketIp = req.socket?.remoteAddress;
  return socketIp && IP_PATTERN.test(socketIp) ? socketIp : null;
}

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

  try {
    const clientIp = extractClientIp(req);

    // Пишем КАЖДЫЙ визит отдельной строкой, без проверки "визит сегодня уже был".
    // Подсчёт уникальных визитов за день — задача view `unique_daily_visits`
    // (COUNT(DISTINCT visitor_ip)), а не этапа записи.
    const { data, error } = await supabase
      .from('site_visits')
      .insert([{ visited_at: new Date().toISOString(), visitor_ip: clientIp }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, visit: data });
  } catch (err) {
    console.error('Ошибка при записи визита:', err.message);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
