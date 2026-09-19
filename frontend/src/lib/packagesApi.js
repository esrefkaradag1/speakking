import { supabase } from './supabase';

/** Varsayilan paketler — DB bos/hata ise odeme sayfasi bunlari kullanir */
export const DEFAULT_PACKAGES = [
  {
    code: 'week-15',
    name: 'Haftalık Paket',
    package_type: 'subscription',
    daily_minutes: 15,
    price_tl: 980,
    period_label: '7 gün',
    per_min_label: '9,33 TL/dk',
    features: ['Günlük 15 dk pratik', 'A1–B1 müfredat', 'Video avatar'],
    highlight: false,
    is_active: true,
    sort_order: 10,
  },
  {
    code: 'week-30',
    name: 'Haftalık Paket',
    package_type: 'subscription',
    daily_minutes: 30,
    price_tl: 1480,
    period_label: '7 gün',
    per_min_label: '7,04 TL/dk',
    features: ['Günlük 30 dk pratik', 'Tüm seviyeler', 'Video avatar'],
    highlight: true,
    is_active: true,
    sort_order: 20,
  },
  {
    code: 'month-15',
    name: 'Aylık Paket',
    package_type: 'subscription',
    daily_minutes: 15,
    price_tl: 1980,
    period_label: '30 gün',
    per_min_label: '4,40 TL/dk',
    features: ['Günlük 15 dk pratik', 'A1–B2 müfredat', 'Öncelikli destek'],
    highlight: false,
    is_active: true,
    sort_order: 30,
  },
  {
    code: 'month-30',
    name: 'Aylık Paket',
    package_type: 'subscription',
    daily_minutes: 30,
    price_tl: 2480,
    period_label: '30 gün',
    per_min_label: '2,75 TL/dk',
    features: ['Günlük 30 dk pratik', 'Tüm seviyeler', 'Öncelikli destek'],
    highlight: false,
    is_active: true,
    sort_order: 40,
  },
  {
    code: 'year-15',
    name: 'Yıllık Paket',
    package_type: 'subscription',
    daily_minutes: 15,
    price_tl: 6880,
    period_label: '365 gün',
    per_min_label: '1,25 TL/dk',
    features: ['Günlük 15 dk pratik', 'Tüm seviyeler', 'En avantajlı birim'],
    highlight: false,
    is_active: true,
    sort_order: 50,
  },
  {
    code: 'year-30',
    name: 'Yıllık Paket',
    package_type: 'subscription',
    daily_minutes: 30,
    price_tl: 8880,
    period_label: '365 gün',
    per_min_label: '0,81 TL/dk',
    features: ['Günlük 30 dk pratik', 'Tüm seviyeler', 'En düşük TL/dk'],
    highlight: false,
    is_active: true,
    sort_order: 60,
  },
  {
    code: 'addon-30',
    name: '+30 dk (bugün)',
    package_type: 'addon',
    daily_minutes: 30,
    price_tl: 120,
    period_label: 'bugün',
    per_min_label: '',
    features: ['Aynı güne +30 dakika'],
    highlight: false,
    is_active: true,
    sort_order: 100,
  },
  {
    code: 'addon-60',
    name: '+1 saat (bugün)',
    package_type: 'addon',
    daily_minutes: 60,
    price_tl: 200,
    period_label: 'bugün',
    per_min_label: '',
    features: ['Aynı güne +60 dakika'],
    highlight: false,
    is_active: true,
    sort_order: 110,
  },
];

function normalizePackage(row) {
  if (!row) return null;
  let features = row.features;
  if (typeof features === 'string') {
    try {
      features = JSON.parse(features);
    } catch {
      features = [];
    }
  }
  if (!Array.isArray(features)) features = [];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    package_type: row.package_type || 'subscription',
    daily_minutes: Number(row.daily_minutes) || 0,
    price_tl: Number(row.price_tl) || 0,
    period_label: row.period_label || '',
    per_min_label: row.per_min_label || '',
    features,
    highlight: !!row.highlight,
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order) || 0,
  };
}

/** Odeme sayfasi — sadece aktif paketler */
export async function getActivePackages() {
  try {
    const { data, error } = await supabase
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    if (data?.length) return data.map(normalizePackage);
  } catch (err) {
    console.warn('packages load fallback:', err?.message || err);
  }
  return DEFAULT_PACKAGES.filter((p) => p.is_active);
}

/** Admin — tum paketler */
export async function getPackagesAdmin() {
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizePackage);
}

export async function createPackage(payload) {
  const row = {
    code: String(payload.code || '').trim(),
    name: String(payload.name || '').trim(),
    package_type: payload.package_type === 'addon' ? 'addon' : 'subscription',
    daily_minutes: Math.max(1, Math.round(Number(payload.daily_minutes) || 30)),
    price_tl: Math.max(0, Number(payload.price_tl) || 0),
    period_label: String(payload.period_label || '').trim(),
    per_min_label: String(payload.per_min_label || '').trim(),
    features: Array.isArray(payload.features) ? payload.features : [],
    highlight: !!payload.highlight,
    is_active: payload.is_active !== false,
    sort_order: Math.round(Number(payload.sort_order) || 0),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('packages').insert(row).select('*').single();
  if (error) throw error;
  return normalizePackage(data);
}

export async function updatePackage(id, updates) {
  const payload = { updated_at: new Date().toISOString() };
  if (updates.code !== undefined) payload.code = String(updates.code).trim();
  if (updates.name !== undefined) payload.name = String(updates.name).trim();
  if (updates.package_type !== undefined) {
    payload.package_type = updates.package_type === 'addon' ? 'addon' : 'subscription';
  }
  if (updates.daily_minutes !== undefined) {
    payload.daily_minutes = Math.max(1, Math.round(Number(updates.daily_minutes) || 1));
  }
  if (updates.price_tl !== undefined) {
    payload.price_tl = Math.max(0, Number(updates.price_tl) || 0);
  }
  if (updates.period_label !== undefined) payload.period_label = String(updates.period_label);
  if (updates.per_min_label !== undefined) payload.per_min_label = String(updates.per_min_label);
  if (updates.features !== undefined) {
    payload.features = Array.isArray(updates.features) ? updates.features : [];
  }
  if (updates.highlight !== undefined) payload.highlight = !!updates.highlight;
  if (updates.is_active !== undefined) payload.is_active = !!updates.is_active;
  if (updates.sort_order !== undefined) {
    payload.sort_order = Math.round(Number(updates.sort_order) || 0);
  }
  const { data, error } = await supabase
    .from('packages')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizePackage(data);
}

export async function deletePackage(id) {
  const { error } = await supabase.from('packages').delete().eq('id', id);
  if (error) throw error;
}
