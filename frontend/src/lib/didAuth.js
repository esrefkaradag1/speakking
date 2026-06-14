/** D-ID Basic auth: dashboard anahtari genelde email:secret veya tek token */

export function didBasicAuthHeader(apiKey) {
  if (!apiKey?.trim()) return {};
  const key = apiKey.trim();
  if (key.includes(':') || key.includes('@')) {
    return { Authorization: `Basic ${btoa(key)}` };
  }
  return { Authorization: `Basic ${key}` };
}
