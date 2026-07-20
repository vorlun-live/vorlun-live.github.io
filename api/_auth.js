import { supabase, configError } from './_supabaseClient.js';

/**
 * Достаёт и проверяет пользователя из заголовка Authorization: Bearer <access_token>.
 * Возвращает null, если токена нет, он невалиден, ИЛИ почта ещё не подтверждена —
 * последнее осознанно: раз нужно требовать подтверждение почты для комментариев
 * и лайков, недостаточно просто быть залогиненным.
 *
 * ВАЖНО: user_id всегда берётся из проверенного токена, а не из тела запроса —
 * иначе клиент мог бы просто прислать чужой user_id и писать от чужого имени.
 */
export async function getAuthenticatedUser(req) {
  if (configError) return null;

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  if (!data.user.email_confirmed_at) return null;

  return data.user;
}
