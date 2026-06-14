/**
 * Supabase: tum veri + auth
 * AI proxy (opsiyonel): ders sohbeti / TTS — REACT_APP_AI_API_URL veya ayni origin
 */

function _envApiBase() {
  let env = (process.env.REACT_APP_AI_API_URL || process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');
  if (!env) return '';
  // Yanlislikla build'e gomulmus localhost — canli domainde yoksay
  if (typeof window !== 'undefined') {
    const onLocal = /localhost|127\.0\.0\.1/.test(window.location.hostname);
    if (!onLocal && /localhost|127\.0\.0\.1/.test(env)) return '';
  }
  return env.replace(/\/api$/, '');
}

export function getBackendBase() {
  const env = _envApiBase();
  if (env) return env;
  if (typeof window !== 'undefined') return window.location.origin;
  // Lokal gelistirme (yarn start): .env.development → REACT_APP_AI_API_URL
  if (process.env.NODE_ENV === 'development') return 'http://localhost:8001';
  return '';
}

export function getAIAPI() {
  const base = getBackendBase();
  return `${base}/api`;
}

/** @deprecated */
export const API = getAIAPI();
