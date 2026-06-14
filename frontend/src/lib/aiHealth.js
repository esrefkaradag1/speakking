import { getAiApiBase } from './apiAuth';

/** AI backend (uvicorn :8001) ayakta mi? */
export async function checkAiBackend(timeoutMs = 4000) {
  const base = getAiApiBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data?.status === 'ok';
  } catch {
    clearTimeout(timer);
    return false;
  }
}
