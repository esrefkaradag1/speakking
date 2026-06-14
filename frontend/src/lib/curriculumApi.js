import { supabase } from './supabase';
import { DEFAULT_CATEGORIES, normalizeCategoryCode, sortCategories } from './curriculumLevels';

function isMissingTableError(error) {
  const msg = error?.message || '';
  return /curriculum_|schema cache|does not exist|relation/i.test(msg);
}

export function moduleDisplayName(module, categoryCode) {
  const name = module?.name_tr || '';
  if (!name) return categoryCode || '';
  if (name.toLowerCase().startsWith((categoryCode || '').toLowerCase())) return name;
  return `${categoryCode} ${name}`;
}

export async function getCurriculumCategories() {
  const { data, error } = await supabase
    .from('curriculum_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return DEFAULT_CATEGORIES;
    throw error;
  }
  if (!data?.length) return DEFAULT_CATEGORIES;
  return sortCategories(
    data.map((row) => ({
      id: row.id,
      code: row.code,
      name_tr: row.name_tr,
      name_en: row.name_en || row.name_tr,
      sort_order: row.sort_order ?? 0,
    }))
  );
}

export async function createCurriculumCategory({ code, name_tr, name_en, sort_order }) {
  const normalized = normalizeCategoryCode(code);
  if (!normalized || normalized.length < 2) {
    throw new Error('Kategori kodu en az 2 karakter olmali (orn. A1, IS_ING)');
  }
  if (!name_tr?.trim()) throw new Error('Turkce kategori adi gerekli');

  const { data, error } = await supabase
    .from('curriculum_categories')
    .insert({
      code: normalized,
      name_tr: name_tr.trim(),
      name_en: (name_en || name_tr).trim(),
      sort_order: sort_order ?? 99,
    })
    .select('*')
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error('Bu kategori kodu zaten var');
    }
    if (isMissingTableError(error)) {
      throw new Error('Once Supabase\'de supabase/add-curriculum-categories.sql calistirin');
    }
    throw error;
  }
  return data;
}

export async function deleteCurriculumCategory(id, code) {
  const { count: modCount, error: modErr } = await supabase
    .from('curriculum_modules')
    .select('id', { count: 'exact', head: true })
    .eq('category_code', code);
  if (modErr && !isMissingTableError(modErr)) throw modErr;
  if ((modCount ?? 0) > 0) {
    throw new Error('Bu ana kategoride alt kutular var — once alt kutulari silin');
  }

  const { count, error: countErr } = await supabase
    .from('scenarios')
    .select('id', { count: 'exact', head: true })
    .eq('level', code);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error('Bu kategoride konu var — once konulari silin');
  }

  const { error } = await supabase.from('curriculum_categories').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Alt kutular (A1 Başlangıç, A1 Gelişmiş) ----------

export async function getCurriculumModules() {
  const { data, error } = await supabase
    .from('curriculum_modules')
    .select('*')
    .eq('is_active', true)
    .order('category_code')
    .order('sort_order', { ascending: true });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return (data || []).map((row) => ({
    id: row.id,
    category_code: row.category_code,
    name_tr: row.name_tr,
    name_en: row.name_en || row.name_tr,
    sort_order: row.sort_order ?? 0,
    label: moduleDisplayName(row, row.category_code),
  }));
}

export async function createCurriculumModule({ category_code, name_tr, name_en, sort_order }) {
  const code = (category_code || '').trim().toUpperCase();
  const title = (name_tr || '').trim();
  if (!code) throw new Error('Ana kategori secin');
  if (!title) throw new Error('Alt kutu adi gerekli');

  const { data, error } = await supabase
    .from('curriculum_modules')
    .insert({
      category_code: code,
      name_tr: title,
      name_en: (name_en || title).trim(),
      sort_order: sort_order ?? 99,
    })
    .select('*')
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error('Bu alt kutu adi zaten var');
    }
    if (isMissingTableError(error)) {
      throw new Error('Once supabase/add-curriculum-modules.sql calistirin');
    }
    throw error;
  }
  return data;
}

export async function deleteCurriculumModule(id) {
  const { count, error: countErr } = await supabase
    .from('scenarios')
    .select('id', { count: 'exact', head: true })
    .eq('module_id', id);
  if (countErr) throw countErr;
  if ((count ?? 0) > 0) {
    throw new Error('Bu alt kutuda konu var — once konulari silin');
  }

  const { error } = await supabase.from('curriculum_modules').delete().eq('id', id);
  if (error) throw error;
}
