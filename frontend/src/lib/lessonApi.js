import { supabase } from './supabase';
import { resetDailyUsageIfNeeded, refreshProfile } from './profiles';

export async function getScenarios(level) {
  let q = supabase.from('scenarios').select('*').eq('is_active', true);
  if (level) q = q.eq('level', level);
  const { data, error } = await q.order('level');
  if (error) throw error;
  return data || [];
}

export async function startLesson(userId, scenarioId) {
  await resetDailyUsageIfNeeded(userId);
  const profile = await refreshProfile(userId);

  if (profile.used_minutes_today >= profile.daily_limit_minutes) {
    throw new Error('Gunluk limitine ulastin');
  }

  const { data: scenario, error: sErr } = await supabase
    .from('scenarios')
    .select('*')
    .eq('id', scenarioId)
    .single();
  if (sErr || !scenario) throw new Error('Senaryo bulunamadi');

  const { data: session, error } = await supabase
    .from('lesson_sessions')
    .insert({
      user_id: userId,
      scenario_id: scenarioId,
      level: scenario.level,
    })
    .select('*')
    .single();
  if (error) throw error;

  const remaining =
    profile.daily_limit_minutes - (profile.used_minutes_today || 0);

  return {
    session: { ...session, id: session.id },
    scenario,
    remaining_minutes: Math.max(0, remaining),
  };
}

export async function endLesson(userId, sessionId, durationMinutes) {
  const ended = new Date().toISOString();
  const { error: sErr } = await supabase
    .from('lesson_sessions')
    .update({ ended_at: ended, duration_minutes: durationMinutes })
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (sErr) throw sErr;

  const profile = await refreshProfile(userId);
  const newUsed = (profile.used_minutes_today || 0) + durationMinutes;
  await supabase
    .from('profiles')
    .update({ used_minutes_today: newUsed })
    .eq('id', userId);
}
