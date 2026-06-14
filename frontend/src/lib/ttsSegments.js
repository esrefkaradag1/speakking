/** TTS: Turkce talimat + Ingilizce model cumle ayri seslendirilir */

/** Tek paragraftaki cumleleri ayir (. ! ?) */
export function splitIntoSentences(text) {
  const t = (text || '').trim();
  if (!t) return [];
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parts = line
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) out.push(...parts);
    else out.push(line);
  }
  return out.length ? out : [t];
}

/** Her segmenti cumle cumle TTS parcasina bol */
export function expandSegmentsToSentences(segments) {
  const out = [];
  for (const seg of segments) {
    if (!seg?.text?.trim()) continue;
    for (const text of splitIntoSentences(seg.text)) {
      out.push({ lang: seg.lang, text });
    }
  }
  return out;
}

function isEnglishLine(line) {
  const s = line.trim().replace(/^["']|["']$/g, '');
  if (!s || s.length < 4) return false;
  if (/[çğıöşüÇĞİÖŞÜ]/.test(s)) return false;
  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  const words = (s.match(/[A-Za-z']+/g) || []).length;
  return words >= 2 && letters >= 4 && letters / s.length > 0.45;
}

const TR_QUOTED_WORDS =
  /\b(her|sabah|işe|iş|giderim|kahvaltı|için|demeliyiz|güzel|doğru|ve|bir|bu|şu|çok|sıradaki|cumle|cümle)\b/i;

/** Kisa Ingilizce alinti: 'every morning' — Turkce alinti degil */
function isEnglishPhrase(text) {
  const s = text.trim().replace(/^["']|["']$/g, '');
  if (!s || s.length < 2) return false;
  if (/[çğıöşüÇĞİÖŞÜ]/.test(s)) return false;
  if (TR_QUOTED_WORDS.test(s)) return false;
  const letters = (s.match(/[a-zA-Z]/g) || []).length;
  const words = (s.match(/[A-Za-z']+/g) || []).length;
  return words >= 1 && letters >= 3 && letters / Math.max(s.length, 1) > 0.45;
}

/** Turkce satirdaki 'Ingilizce' alintilari ayir */
function expandLineToLangSegments(lineTrim) {
  const quoteRe = /"([^"]+)"|'([^']+)'/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let hasQuotes = false;

  while ((match = quoteRe.exec(lineTrim)) !== null) {
    hasQuotes = true;
    const before = lineTrim.slice(lastIndex, match.index).trim();
    const quoted = (match[1] || match[2] || '').trim();
    if (before) parts.push({ lang: 'tr', text: before });
    if (quoted) {
      parts.push({
        lang: isEnglishPhrase(quoted) ? 'en' : 'tr',
        text: quoted.replace(/^["']|["']$/g, ''),
      });
    }
    lastIndex = match.index + match[0].length;
  }

  const after = lineTrim.slice(lastIndex).trim();
  if (after) parts.push({ lang: 'tr', text: after });

  if (!hasQuotes) {
    if (isEnglishLine(lineTrim)) {
      return [{ lang: 'en', text: lineTrim.replace(/^["']|["']$/g, '') }];
    }
    return [{ lang: 'tr', text: lineTrim }];
  }

  const merged = [];
  for (const p of parts) {
    const text = p.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (
      p.lang === 'tr' &&
      text.length <= 8 &&
      merged.length &&
      merged[merged.length - 1].lang === 'tr'
    ) {
      merged[merged.length - 1].text += ` ${text}`;
      continue;
    }
    merged.push({ lang: p.lang, text });
  }
  return merged;
}

export function inferTtsSegments(text) {
  const segments = [];
  const tagRe = /\[SAY_(TR|EN)\]([\s\S]*?)\[\/SAY_\1\]/gi;
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const lang = m[1].toUpperCase() === 'TR' ? 'tr' : 'en';
    const t = m[2].trim();
    if (t) segments.push({ lang, text: t });
  }
  if (segments.length) return expandSegmentsToSentences(segments);

  const clean = text
    .replace(/\*/g, '')
    .replace(/\[CORRECTION\][\s\S]*?\[\/CORRECTION\]/gi, '')
    .replace(/\[VOCABULARY\][\s\S]*?\[\/VOCABULARY\]/gi, '')
    .replace(/\[SAY_(TR|EN)\][\s\S]*?\[\/SAY_\1\]/gi, '')
    .trim();

  for (const block of clean.split(/\n\s*\n/)) {
    for (const line of block.split('\n')) {
      const lineTrim = line.trim();
      if (!lineTrim) continue;
      if (isEnglishLine(lineTrim)) {
        segments.push({ lang: 'en', text: lineTrim.replace(/^["']|["']$/g, '') });
      } else {
        segments.push(...expandLineToLangSegments(lineTrim));
      }
    }
  }

  if (!segments.length && clean) segments.push({ lang: 'tr', text: clean });
  return expandSegmentsToSentences(segments);
}
