import { supabase } from './supabase';

export async function ensureProfile(authUser) {
  if (!authUser?.id) throw new Error('Oturum gerekli');

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (existing) return existing;

  const name =
    authUser.user_metadata?.name ||
    authUser.email?.split('@')[0] ||
    'Kullanici';

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: authUser.id,
      email: authUser.email,
      name,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export function mapProfileToUser(profile, authUser) {
  return {
    id: profile.id,
    email: profile.email || authUser?.email,
    name: profile.name,
    level: profile.level || 'A1',
    daily_limit_minutes: profile.daily_limit_minutes ?? 30,
    used_minutes_today: profile.used_minutes_today ?? 0,
    is_admin: profile.is_admin ?? false,
    created_at: profile.created_at,
    badges: profile.badges || [],
  };
}

export async function resetDailyUsageIfNeeded(userId) {
  await supabase.rpc('reset_daily_usage_if_needed', { p_user_id: userId });
}

export async function updateProfileLevel(userId, level) {
  const { error } = await supabase.from('profiles').update({ level }).eq('id', userId);
  if (error) throw error;
}

export async function refreshProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}
