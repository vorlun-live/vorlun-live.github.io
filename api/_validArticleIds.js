// Белый список допустимых id статей — единый источник для всех API endpoint'ов
// (article-like.js, article-comment.js), чтобы никто не мог записать данные
// с произвольным article_id. Должен совпадать с массивом ARTICLES в index.html.
//
// Файл начинается с "_", поэтому Vercel не создаёт из него отдельный HTTP-роут.
export const VALID_ARTICLE_IDS = new Set([
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
