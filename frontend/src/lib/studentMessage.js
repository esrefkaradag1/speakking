/** Ogrenci mesajini (mikrofon/yazi) cevap vs yardim vs Ingilizce cikarim icin isle */

const HELP_RE =
  /yard[iı]m|çözemedim|cozemedim|anlamad[iı]m|bilmiyorum|yapamad[iı]m|bulamad[iı]m|tekrar\s+eder|nas[iı]l\s+yap|ipucu|söyler\s+misin|soyler\s+misin|help\s+me|i\s+can'?t|cannot\s+translate|don'?t\s+know|tam\s+yapamad|cevap\s+bulamad|bu\s+soruyu|ge[çc]elim|ge[çc]ebilir|atla|ba[şs]ka\s+soru|skip|next\s+question|pass/i;

const SKIP_RE =
  /ge[çc]elim|ge[çc]ebilir|atla|ba[şs]ka\s+soru|soruyu\s+ge[çc]|bilmiyorum|yapamad[iı]m|don'?t\s+know|skip|next\s+question|pass\s+this/i;

const TURKISH_RE = /[çğıöşüÇĞİÖŞÜ]/;

/** Web Speech (en-US) Turkceyi fonetik Ingilizce yazar — bilinen kaliplar */
const PHONETIC_TR_MAP = [
  [/boo\s*nay|bonay|bana\s+yar/i, 'bana yardım'],
  [/are\s*d[iı]m|ardim|are\s*dim/i, 'yardım'],
  [/ether\s*misin|eder\s*misin|ether\s*me/i, 'eder misin'],
  [/tam\s*yapamad|tom\s*yapamad/i, 'tam yapamadım'],
  [/cevap\s*bulamad|jewap\s*bulamad/i, 'cevap bulamadım'],
  [/bu\s*soruyu|boo\s*soruyu/i, 'bu soruyu'],
  [/cozemedim|chozemedim|çözemedim/i, 'çözemedim'],
  [/yapamadim|yapamadım|yapamad[iı]m/i, 'yapamadım'],
  [/anlamadim|anlamadım/i, 'anlamadım'],
  [/bilmiyorum|bill\s*me\s*yo|gullible|dinosaur/i, 'bilmiyorum'],
  [/ge[çc]elim|getch|get\s*elim|catch\s*elim|geçelim/i, 'geçelim'],
  [/ba[şs]ka\s+soru|bashka|another\s+question/i, 'başka soru'],
  [/yardim|yardım|yar\s*dim/i, 'yardım'],
  [/lutfen|lütfen|loot\s*fen/i, 'lütfen'],
  [/tekrar|tek\s*rar/i, 'tekrar'],
  [/ipucu|ee\s*poo\s*ju/i, 'ipucu'],
];

const TURKISH_PHONETIC_HINTS =
  /\b(boo|nay|are\s+d[iı]m|eder\s+misin|yard[iı]m|tam\s+yapamad|cevap\s+bulamad|bu\s+soruyu|cozemedim|yapamadim|anlamadim|bilmiyorum|lutfen|tekrar|ipucu|gullible|dinosaur|getch|geçelim|gecelim)\b/i;

function latinWords(text) {
  return (text.match(/[A-Za-z']+/g) || []).filter((w) => w.length > 1);
}

/** en-US ASR'nin Turkceyi bozmus halini yakala */
export function looksLikePhoneticTurkish(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (TURKISH_RE.test(t)) return true;
  if (TURKISH_PHONETIC_HINTS.test(t)) return true;
  if (HELP_RE.test(t) && latinWords(t).length <= 10) return true;
  if (SKIP_RE.test(t)) return true;
  const hits = PHONETIC_TR_MAP.filter(([re]) => re.test(t)).length;
  return hits >= 1 && latinWords(t).length <= 8;
}

/** Fonetik metni Turkce yardim ifadesine cevir (mumkunse) */
export function repairPhoneticTurkish(text) {
  let t = String(text || '').trim();
  if (!t) return t;
  if (TURKISH_RE.test(t) && HELP_RE.test(t)) return t;

  let repaired = t;
  for (const [re, repl] of PHONETIC_TR_MAP) {
    repaired = repaired.replace(re, repl);
  }
  if (looksLikePhoneticTurkish(t) && !TURKISH_RE.test(repaired)) {
    if (SKIP_RE.test(t) || /geç|atla|skip|bilmiyor|gullible|dinosaur/i.test(t)) {
      return 'Bilmiyorum, bu soruyu geçelim başka sorar mısın?';
    }
    if (/yard|help|eder|misin|yapamad|cozem|anlamad|ipucu|tekrar/i.test(t)) {
      return 'Bana yardım eder misin, bu soruyu yapamadım.';
    }
  }
  return repaired;
}

function looksLikeTurkishHelp(text) {
  const repaired = repairPhoneticTurkish(text);
  if (HELP_RE.test(repaired) || HELP_RE.test(text) || SKIP_RE.test(text) || SKIP_RE.test(repaired)) {
    return true;
  }
  if (TURKISH_RE.test(repaired) && latinWords(repaired).length < 3) return true;
  if (looksLikePhoneticTurkish(text) && latinWords(text).length <= 10) return true;
  return false;
}

export function looksLikeSkipRequest(text) {
  const t = repairPhoneticTurkish(text);
  return SKIP_RE.test(t) || SKIP_RE.test(String(text || ''));
}

/** Tırnak/icindeki Ingilizce parcayi bul */
export function extractQuotedEnglish(text) {
  const quotes = [
    ...text.matchAll(/"([^"]{2,200})"/g),
    ...text.matchAll(/'([^']{2,200})'/g),
  ];
  for (let i = quotes.length - 1; i >= 0; i--) {
    const q = quotes[i][1].trim();
    if (!TURKISH_RE.test(q) && latinWords(q).length >= 2) return q;
  }
  return null;
}

/** Karisik cumleden en uzun Ingilizce parcayi sec */
export function extractEnglishPhrase(text) {
  const parts = text
    .split(/[,;!?…]+|(?<=[.])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  let best = '';
  for (const part of parts) {
    if (TURKISH_RE.test(part)) continue;
    if (HELP_RE.test(part) && latinWords(part).length < 3) continue;
    if (looksLikePhoneticTurkish(part)) continue;
    const words = latinWords(part);
    if (words.length >= 2 && part.length > best.length) best = part;
  }
  if (best) return best.replace(/^["']|["']$/g, '').trim();

  const words = latinWords(text);
  if (
    words.length >= 2 &&
    !TURKISH_RE.test(text) &&
    !looksLikeTurkishHelp(text) &&
    !looksLikePhoneticTurkish(text)
  ) {
    return words.join(' ');
  }
  return null;
}

/**
 * Beklenen Ingilizce cevaba yakinlik (0..1) — zayif telaffuz icin.
 */
export function englishAnswerSimilarity(spoken, expected) {
  const a = normalizeEn(spoken);
  const b = normalizeEn(expected);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aw = a.split(/\s+/).filter(Boolean);
  const bw = b.split(/\s+/).filter(Boolean);
  if (!aw.length || !bw.length) return 0;

  let hits = 0;
  for (const w of bw) {
    if (aw.some((x) => wordClose(x, w))) hits += 1;
  }
  const wordScore = hits / bw.length;

  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  // Telaffuz toleransi: kelime sirasi / yakin ses benzerligi
  return Math.max(wordScore * 0.75 + lev * 0.25, wordScore, lev * 0.9);
}

function normalizeEn(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordClose(a, b) {
  if (a === b) return true;
  if (a.length <= 2 || b.length <= 2) return a === b;
  if (a.includes(b) || b.includes(a)) return true;
  // take/tayk/tek gibi kisa kelimelerde daha toleransli
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 5) return d <= 2;
  return d <= Math.max(1, Math.floor(Math.min(a.length, b.length) / 2.5));
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * @returns {{ kind: 'help'|'answer'|'off_topic'|'skip', message: string, englishAnswer?: string }}
 */
export function preprocessStudentMessage(raw) {
  const original = String(raw || '').trim();
  if (!original) return { kind: 'off_topic', message: '' };

  const message = repairPhoneticTurkish(original);
  const quoted = extractQuotedEnglish(message) || extractQuotedEnglish(original);
  const english = quoted || extractEnglishPhrase(message) || extractEnglishPhrase(original);
  const turkishChars = (message.match(TURKISH_RE) || []).length;
  const isHelp = looksLikeTurkishHelp(original) || looksLikeTurkishHelp(message);
  const isSkip = looksLikeSkipRequest(original) || looksLikeSkipRequest(message);

  // Bilmiyorum / gecelim → dogru cevabi verip sonraki soruya gec
  if (isSkip && !english) {
    return { kind: 'skip', message };
  }

  // "Bu soruyu cozemedim, I go to school olabilir mi?" → sadece Ingilizce cevap
  if (english && (turkishChars > 0 || isHelp || HELP_RE.test(message))) {
    return { kind: 'answer', message, englishAnswer: english };
  }

  if (isHelp && !english) {
    return { kind: 'help', message };
  }

  if (turkishChars >= 2 && latinWords(message).length < 2) {
    return { kind: 'help', message };
  }

  if (english || (latinWords(message).length >= 2 && !isHelp)) {
    return {
      kind: 'answer',
      message,
      englishAnswer: english || message,
    };
  }

  return { kind: 'help', message };
}
