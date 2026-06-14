/** Müfredat ana kategorileri — paylaşılan sabitler ve renkler */

export const DEFAULT_CATEGORIES = [
  { code: 'A1', name_tr: 'Başlangıç', name_en: 'Beginner', sort_order: 1 },
  { code: 'A2', name_tr: 'Temel', name_en: 'Elementary', sort_order: 2 },
  { code: 'B1', name_tr: 'Orta', name_en: 'Intermediate', sort_order: 3 },
  { code: 'B2', name_tr: 'Orta Üstü', name_en: 'Upper-Int', sort_order: 4 },
  { code: 'C1', name_tr: 'İleri', name_en: 'Advanced', sort_order: 5 },
  { code: 'C2', name_tr: 'Uzman', name_en: 'Mastery', sort_order: 6 },
];

const PRESET_COLORS = {
  A1: { border: 'border-t-teal-500', bg: 'bg-teal-500/10', text: 'text-teal-400', badge: 'bg-teal-500/20 text-teal-400' },
  A2: { border: 'border-t-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-400' },
  B1: { border: 'border-t-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-400' },
  B2: { border: 'border-t-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400', badge: 'bg-cyan-500/20 text-cyan-400' },
  C1: { border: 'border-t-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-400' },
  C2: { border: 'border-t-pink-500', bg: 'bg-pink-500/10', text: 'text-pink-400', badge: 'bg-pink-500/20 text-pink-400' },
};

const FALLBACK_PALETTE = [
  { border: 'border-t-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-400', badge: 'bg-violet-500/20 text-violet-400' },
  { border: 'border-t-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-400' },
  { border: 'border-t-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-400', badge: 'bg-rose-500/20 text-rose-400' },
  { border: 'border-t-lime-500', bg: 'bg-lime-500/10', text: 'text-lime-400', badge: 'bg-lime-500/20 text-lime-400' },
];

export function categoryColors(code, index = 0) {
  return PRESET_COLORS[code] || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

export function normalizeCategoryCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .slice(0, 24);
}

export function sortCategories(list) {
  return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}
