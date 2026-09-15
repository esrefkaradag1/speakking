/** Cevap beklenmeden once seslendirilecek TTS parcalari. */

const FEEDBACK_MARKERS =
  /doğru|dogru|yanlış|yanlis|hata|teşekkür|tesekkur|güzel|guzel|harika|tebrik|yapmalı|yapmaliydin|olmalı|demek|anlamına|çevirisi|cevirisi|ingilizcesi\s+nedir|yapay zeka|sesinizi algılayam|yazarak iletin/i;

function isChallengeBlock(text) {
  return /çevir|sıradaki|şimdi|tekrar|cumle|cümle|how do you say|dinleyelim/i.test(text);
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

/**
 * Tum talimat + soru + Ingilizce model cumleleri seslendirilir.
 * Eksik kalan tirnakli TR soru veya "dinleyelim" sonrasi EN eklenir.
 */
export function segmentsForTtsPlayback(fullText, segments, { hasCorrections = false } = {}) {
  const cleaned = (segments || []).filter((seg) => seg?.text?.trim());
  if (!cleaned.length && !fullText?.trim()) return [];

  const out = [...cleaned];
  const joined = out.map((s) => s.text).join('\n');

  // "Su cumleyi cevir" sonrasi tirnakli TR soru TTS'de yoksa ekle
  const challenge = extractChallengeTurkishSentence(fullText || '');
  if (challenge) {
    const norm = normSentence(challenge);
    const already = out.some((s) => normSentence(s.text).includes(norm) || norm.includes(normSentence(s.text)));
    if (!already) {
      // Cevir talimatindan sonra ekle
      const insertAt = Math.max(
        0,
        out.findIndex((s) => /çevir|cevir|sıradaki|siradaki/i.test(s.text))
      );
      const idx = insertAt >= 0 ? insertAt + 1 : out.length;
      out.splice(idx, 0, { lang: 'tr', text: challenge });
    }
  }

  // "Dogrusunu dinleyelim" var ama sonraki EN segment yoksa fullText'ten cikar
  if (/dinleyelim/i.test(fullText || '') || /dinleyelim/i.test(joined)) {
    const hasEn = out.some((s) => s.lang === 'en' && s.text.trim().split(/\s+/).length >= 3);
    if (!hasEn) {
      const sayEn = [...(fullText || '').matchAll(/\[SAY_EN\]([\s\S]*?)\[\/SAY_EN\]/gi)];
      for (const m of sayEn) {
        const en = m[1].trim().replace(/^["']|["']$/g, '');
        if (en.split(/\s+/).length >= 2) {
          out.push({ lang: 'en', text: en });
        }
      }
      if (!out.some((s) => s.lang === 'en')) {
        // Duz metinden Ingilizce satir
        for (const line of (fullText || '').split('\n')) {
          const t = line.trim().replace(/^["']|["']$/g, '');
          if (
            t.length > 8 &&
            !/[çğıöşüÇĞİÖŞÜ]/.test(t) &&
            (t.match(/[A-Za-z']+/g) || []).length >= 3 &&
            !/dinleyelim|sıradaki|çevir/i.test(t)
          ) {
            out.push({ lang: 'en', text: t });
            break;
          }
        }
      }
    }
  }

  void hasCorrections;
  return out.filter((seg) => seg?.text?.trim());
}

/** @deprecated */
export function segmentsBeforeUserAnswer(fullText, segments) {
  return segmentsForTtsPlayback(fullText, segments, { hasCorrections: false });
}
