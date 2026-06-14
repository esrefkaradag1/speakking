/** Ipucu modulu: yalnizca ogrenciye sorulan Turkce cumleyi sec (geri bildirim cumlelerini atla). */

const FEEDBACK_MARKERS =
  /doğru|dogru|yanlış|yanlis|hata|teşekkür|tesekkur|güzel|guzel|harika|tebrik|yapmalı|yapmaliydin|olmalı|demek|anlamına|çevirisi|cevirisi|ingilizcesi\s+nedir|yapay zeka|sesinizi algılayam|yazarak iletin/i;

function isChallengeBlock(text) {
  return /çevir|sıradaki|şimdi|tekrar|cumle|cümle|how do you say/i.test(text);
}

function extractQuotedTurkish(text) {
  const out = [];
  const patterns = [
    /"([^"]{1,240})"/g,
    /'([^']{1,240})'/g,
    /\*\*([^*]{1,240})\*\*/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const s = match[1]?.trim();
      if (s && s.length > 4 && /[ıİğĞüÜşŞöÖçÇ]/.test(s)) out.push(s);
    }
  }
  return out;
}

/** "Sıradaki cümle:" satirindan sonraki Turkce soru cumlesi */
function extractSiradakiChallenge(text) {
  const quoted = text.match(
    /s[ıi]radaki\s+c[üu]mle\s*:?\s*(?:\r?\n\s*)+"([^"]{4,240})"/i,
  );
  if (quoted?.[1]) {
    const s = quoted[1].replace(/[.!?…]+$/g, '').trim();
    if (s && !FEEDBACK_MARKERS.test(s)) return s;
  }
  const plain = text.match(
    /s[ıi]radaki\s+c[üu]mle\s*:?\s*(?:\r?\n\s*)+([^\n\r"']{4,240})/i,
  );
  if (!plain?.[1]) return null;
  const s = plain[1].replace(/[.!?…]+$/g, '').trim();
  if (!s || FEEDBACK_MARKERS.test(s)) return null;
  return s;
}

function pickChallengeFromBlock(block) {
  const quotes = extractQuotedTurkish(block);
  for (let j = quotes.length - 1; j >= 0; j--) {
    if (!FEEDBACK_MARKERS.test(quotes[j])) return quotes[j];
  }
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 8 && /[ıİğĞüÜşŞöÖçÇ]/.test(l));
  for (let j = lines.length - 1; j >= 0; j--) {
    if (!FEEDBACK_MARKERS.test(lines[j])) return lines[j].replace(/^["']|["']$/g, '');
  }
  return null;
}

/**
 * AI yanitindan ipucu icin Turkce soru cumlesini cikar.
 * Geri bildirimdeki alinti cumleleri (or. "Bu soru dogru ama...") atlanir.
 * Birden fazla soru varsa en son (sıradaki) cumle secilir.
 */
export function extractChallengeTurkishSentence(text) {
  if (!text?.trim()) return null;

  const candidates = [];

  const sayTrBlocks = [...text.matchAll(/\[SAY_TR\]([\s\S]*?)\[\/SAY_TR\]/gi)];
  for (const match of sayTrBlocks) {
    const block = match[1];
    if (!isChallengeBlock(block)) continue;
    const picked = pickChallengeFromBlock(block);
    if (picked) candidates.push(picked);
  }

  const siradaki = extractSiradakiChallenge(text);
  if (siradaki) candidates.push(siradaki);

  const siradakiIdx = text.search(/s[ıi]radaki\s+c[üu]mle/i);
  const allQuotes = extractQuotedTurkish(text);
  const scoped =
    siradakiIdx >= 0
      ? allQuotes.filter((q) => text.indexOf(q) >= siradakiIdx)
      : allQuotes;
  for (let i = scoped.length - 1; i >= 0; i--) {
    if (!FEEDBACK_MARKERS.test(scoped[i])) {
      candidates.push(scoped[i]);
      break;
    }
  }

  if (candidates.length) return candidates[candidates.length - 1];
  return null;
}

function normSentence(s) {
  return (s || '')
    .replace(/^["']|["']$/g, '')
    .replace(/[.!?…]+$/g, '')
    .trim()
    .toLocaleLowerCase('tr');
}

/** Cevap beklenen Turkce soru cumlesinden onceki TTS parcalari (cümle okunmaz). */
export function segmentsBeforeUserAnswer(fullText, segments) {
  if (!segments?.length) return [];

  let challenge = extractChallengeTurkishSentence(fullText);
  if (!challenge && /s[ıi]radaki|çevir/i.test(fullText || '')) {
    const trOnly = segments.filter((s) => s.lang === 'tr');
    for (let i = trOnly.length - 1; i >= 0; i--) {
      const t = trOnly[i].text;
      if (
        /s[ıi]radaki|çevir/i.test(t) ||
        t.endsWith(':') ||
        t.length < 8 ||
        !/[ıİğĞüÜşŞöÖçÇ]/.test(t)
      ) {
        continue;
      }
      challenge = t;
      break;
    }
  }

  if (!challenge) return segments;

  const cNorm = normSentence(challenge);
  const out = [];
  for (const seg of segments) {
    const sNorm = normSentence(seg.text);

    if (seg.lang === 'en') {
      const wordCount = seg.text.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount >= 4 || seg.text.length > 24) {
        continue;
      }
    }

    const isInstruction =
      (/çevir|sıradaki|siradaki/i.test(seg.text) || seg.text.endsWith(':')) &&
      sNorm !== cNorm;

    if (seg.lang === 'tr' && !isInstruction && sNorm === cNorm) {
      break;
    }
    if (seg.lang === 'tr' && !isInstruction && cNorm.length > 6 && sNorm.includes(cNorm)) {
      break;
    }
    out.push(seg);
  }
  return out.length ? out : segments.slice(0, -1);
}
