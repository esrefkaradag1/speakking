import { supabase } from './supabase';
import axios from 'axios';
import { getAuthHeaders, getAiApiBase } from './apiAuth';

// ---------- Sentences ----------
export async function getSentences(level) {
  let q = supabase.from('sentences').select('*').order('created_at', { ascending: false });
  if (level && level !== 'all') q = q.eq('level', level);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createSentence(payload) {
  const { data, error } = await supabase.from('sentences').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateSentence(id, payload) {
  const { error } = await supabase.from('sentences').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteSentence(id) {
  const { error } = await supabase.from('sentences').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkSentences(sentences) {
  const { data, error } = await supabase.from('sentences').insert(sentences).select('id');
  if (error) throw error;
  return { inserted: data?.length || 0 };
}

// ---------- Scenarios ----------
export async function getScenariosAdmin() {
  const { data, error } = await supabase.from('scenarios').select('*').order('level');
  if (error) throw error;
  return data || [];
}

export async function createScenario(payload) {
  const { category_code: _drop, ...row } = payload;
  const { data, error } = await supabase.from('scenarios').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteScenario(id) {
  const { error } = await supabase.from('scenarios').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Settings ----------
function normalizeAdminSettings(row) {
  if (!row) return row;
  return {
    ...row,
    daily_limit_minutes: row.daily_limit_minutes ?? row.default_daily_limit ?? 30,
    elevenlabs_api_key: row.elevenlabs_api_key ?? '',
    elevenlabs_voice_id: row.elevenlabs_voice_id ?? '21m00Tcm4TlvDq8ikWAM',
    use_elevenlabs: !!row.use_elevenlabs,
    cartesia_api_key: row.cartesia_api_key ?? '',
    cartesia_voice_id: row.cartesia_voice_id ?? 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
    use_cartesia: !!row.use_cartesia,
  };
}

function toAdminSettingsPayload(updates) {
  const payload = { updated_at: new Date().toISOString() };
  if (updates.teacher_tone !== undefined) payload.teacher_tone = updates.teacher_tone;
  if (updates.speech_speed !== undefined) payload.speech_speed = updates.speech_speed;
  if (updates.daily_limit_minutes !== undefined) {
    payload.daily_limit_minutes = updates.daily_limit_minutes;
  }
  if (updates.elevenlabs_api_key !== undefined) {
    payload.elevenlabs_api_key = updates.elevenlabs_api_key;
  }
  if (updates.elevenlabs_voice_id !== undefined) {
    payload.elevenlabs_voice_id = updates.elevenlabs_voice_id;
  }
  if (updates.use_elevenlabs !== undefined) {
    payload.use_elevenlabs = !!updates.use_elevenlabs;
  }
  if (updates.cartesia_api_key !== undefined) {
    payload.cartesia_api_key = updates.cartesia_api_key;
  }
  if (updates.cartesia_voice_id !== undefined) {
    payload.cartesia_voice_id = updates.cartesia_voice_id;
  }
  if (updates.use_cartesia !== undefined) {
    payload.use_cartesia = !!updates.use_cartesia;
  }
  return payload;
}

function formatSupabaseError(error) {
  const msg = error?.message || 'Bilinmeyen hata';
  if (/non-volatile function/i.test(msg)) {
    return `${msg} — SQL Editor: supabase/fix-is-admin-volatile.sql`;
  }
  if (/elevenlabs|use_elevenlabs|schema cache|column/i.test(msg)) {
    return `${msg} — SQL Editor: supabase/add-elevenlabs-settings.sql`;
  }
  if (/cartesia|use_cartesia/i.test(msg)) {
    return `${msg} — SQL Editor: supabase/add-cartesia-settings.sql`;
  }
  return msg;
}

export async function getAdminSettings() {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('*')
    .eq('id', 'global_settings')
    .single();
  if (error) throw new Error(formatSupabaseError(error));
  return normalizeAdminSettings(data);
}

export async function updateAdminSettings(updates) {
  const payload = toAdminSettingsPayload(updates);
  const { error } = await supabase
    .from('admin_settings')
    .update(payload)
    .eq('id', 'global_settings');
  if (error) throw new Error(formatSupabaseError(error));
}

// ---------- AI config ----------
export async function getAiConfig() {
  const { data, error } = await supabase
    .from('ai_config')
    .select('*')
    .eq('id', 'ai_training_config')
    .single();
  if (error) throw error;
  return data;
}

export async function updateAiConfig(updates) {
  const { error } = await supabase
    .from('ai_config')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', 'ai_training_config');
  if (error) throw error;
}

// ---------- Users ----------
export async function getAdminUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, level, daily_limit_minutes, used_minutes_today, is_admin, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createAdminUser({ email, password, name, level, is_admin, daily_limit_minutes }) {
  const { data: authData, error: signErr } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (signErr) throw signErr;
  const uid = authData.user?.id;
  if (!uid) throw new Error('Kullanici olusturulamadi');

  const { error } = await supabase
    .from('profiles')
    .update({
      name,
      level: level || 'A1',
      is_admin: !!is_admin,
      daily_limit_minutes: daily_limit_minutes ?? 30,
    })
    .eq('id', uid);
  if (error) throw error;
  return { id: uid, email, name };
}

export async function updateAdminUserProfile(userId, updates) {
  const payload = {};
  if (updates.daily_limit_minutes !== undefined) {
    payload.daily_limit_minutes = Math.max(1, Math.round(updates.daily_limit_minutes));
  }
  if (updates.used_minutes_today !== undefined) {
    payload.used_minutes_today = Math.max(0, Number(updates.used_minutes_today));
  }
  if (updates.level !== undefined) payload.level = updates.level;
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.is_admin !== undefined) payload.is_admin = !!updates.is_admin;
  if (Object.keys(payload).length === 0) return null;

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id, email, name, level, daily_limit_minutes, used_minutes_today, is_admin, created_at')
    .single();
  if (error) throw new Error(formatSupabaseError(error));
  return data;
}

export async function updateAdminUserPassword(userId, newPassword) {
  const headers = await getAuthHeaders();
  const res = await axios.put(
    `${getAiApiBase()}/admin/users/${userId}/password`,
    { password: newPassword },
    { headers }
  );
  return res.data;
}

// ---------- Stats ----------
export async function getAdminStats() {
  const today = new Date().toISOString().slice(0, 10);
  const [users, sessions, scenarios, todaySessions] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('lesson_sessions').select('id', { count: 'exact', head: true }),
    supabase.from('scenarios').select('id', { count: 'exact', head: true }),
    supabase
      .from('lesson_sessions')
      .select('id', { count: 'exact', head: true })
      .gte('started_at', `${today}T00:00:00Z`),
  ]);

  return {
    total_users: users.count ?? 0,
    total_sessions: sessions.count ?? 0,
    total_scenarios: scenarios.count ?? 0,
    today_sessions: todaySessions.count ?? 0,
  };
}

// ---------- Documents ----------
export async function getDocuments() {
  const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getDocumentContent(id) {
  const { data, error } = await supabase.from('documents').select('text_content, filename').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(id) {
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadDocument(file, userId) {
  let textContent = '';
  if (file.type === 'text/plain' || file.type === 'text/csv') {
    textContent = await file.text();
  } else {
    textContent = `[${file.name} — metin cikarimi henuz desteklenmiyor, TXT/CSV yukleyin]`;
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      filename: file.name,
      content_type: file.type,
      text_content: textContent.slice(0, 50000),
      size_bytes: file.size,
      uploaded_by: userId,
      file_url: null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function extractDocumentToBank(docId, level) {
  const { data: doc } = await supabase.from('documents').select('text_content').eq('id', docId).single();
  if (!doc?.text_content) throw new Error('Belge metni yok');

  const lines = doc.text_content.split('\n').filter((l) => l.includes('|') || l.includes('\t'));
  const rows = [];
  for (const line of lines.slice(0, 200)) {
    const parts = line.includes('|') ? line.split('|') : line.split('\t');
    if (parts.length >= 2) {
      rows.push({
        turkish: parts[0].trim(),
        english: parts[1].trim(),
        level: level || 'A1',
        topic: 'Belge',
      });
    }
  }
  if (!rows.length) throw new Error('Cikarilacak cumle bulunamadi (TR|EN formatinda satirlar)');
  await bulkSentences(rows);
  return { inserted: rows.length };
}
