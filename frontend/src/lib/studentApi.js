import { supabase } from './supabase';
import { refreshProfile } from './profiles';

export const BADGES = {
  first_lesson: { id: 'first_lesson', name: 'Ilk Adim', name_en: 'First Step', description: 'Ilk dersini tamamladin!', icon: 'star', color: 'yellow' },
  streak_3: { id: 'streak_3', name: '3 Gun Seri', name_en: '3 Day Streak', description: '3 gun ust uste pratik!', icon: 'flame', color: 'orange' },
  streak_7: { id: 'streak_7', name: 'Haftalik Seri', name_en: 'Weekly Streak', description: '7 gun seri!', icon: 'flame', color: 'red' },
  streak_30: { id: 'streak_30', name: 'Aylik Seri', name_en: 'Monthly Streak', description: '30 gun seri!', icon: 'crown', color: 'purple' },
  corrections_10: { id: 'corrections_10', name: '10 Duzeltme', name_en: '10 Corrections', description: '10 duzeltme ogrendin', icon: 'check', color: 'green' },
  corrections_50: { id: 'corrections_50', name: '50 Duzeltme', name_en: '50 Corrections', description: '50 duzeltme!', icon: 'award', color: 'blue' },
  time_1h: { id: 'time_1h', name: '1 Saat', name_en: '1 Hour', description: '1 saat pratik', icon: 'clock', color: 'cyan' },
  time_5h: { id: 'time_5h', name: '5 Saat', name_en: '5 Hours', description: '5 saat pratik', icon: 'clock', color: 'indigo' },
  time_10h: { id: 'time_10h', name: '10 Saat', name_en: '10 Hours', description: '10 saat pratik', icon: 'gem', color: 'violet' },
  level_a2: { id: 'level_a2', name: 'A2', name_en: 'A2 Level', description: 'A2 seviyesi', icon: 'trending', color: 'teal' },
  level_b1: { id: 'level_b1', name: 'B1', name_en: 'B1 Level', description: 'B1 seviyesi', icon: 'trending', color: 'emerald' },
  level_b2: { id: 'level_b2', name: 'B2', name_en: 'B2 Level', description: 'B2 seviyesi', icon: 'award', color: 'cyan' },
  level_c1: { id: 'level_c1', name: 'C1', name_en: 'C1 Level', description: 'C1 seviyesi', icon: 'award', color: 'violet' },
  level_c2: { id: 'level_c2', name: 'C2', name_en: 'C2 Master', description: 'C2 usta', icon: 'gem', color: 'pink' },
};

function parseDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function calcStreak(sessions) {
  const dates = new Set(
    sessions.map((s) => parseDate(s.started_at)).filter(Boolean)
  );
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let d = new Date();
  for (let i = 0; i < 400; i++) {
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else if (key !== today || streak === 0) {
      break;
    } else {
      d.setDate(d.getDate() - 1);
    }
  }
  return streak;
}

export async function checkAndAwardBadges(userId, profile, sessions) {
  const current = [...(profile.badges || [])];
  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((a, s) => a + (s.duration_minutes || 0), 0);
  const totalCorrections = sessions.reduce(
    (a, s) => a + (Array.isArray(s.corrections) ? s.corrections.length : 0),
    0
  );
  const streak = calcStreak(sessions);
  const level = profile.level || 'A1';

  const meaningful = (sessions || []).filter(
    (s) =>
      (s.duration_minutes || 0) >= 2 ||
      (Array.isArray(s.transcript) && s.transcript.length >= 2)
  );
  const countAt = (lv) => meaningful.filter((s) => s.level === lv).length;

  const checks = [
    ['first_lesson', meaningful.length >= 1],
    ['streak_3', streak >= 3],
    ['streak_7', streak >= 7],
    ['streak_30', streak >= 30],
    ['corrections_10', totalCorrections >= 10],
    ['corrections_50', totalCorrections >= 50],
    ['time_1h', totalMinutes >= 60],
    ['time_5h', totalMinutes >= 300],
    ['time_10h', totalMinutes >= 600],
    ['level_a2', countAt('A2') >= 8],
    ['level_b1', countAt('B1') >= 10],
    ['level_b2', countAt('B2') >= 12],
    ['level_c1', countAt('C1') >= 15],
    ['level_c2', countAt('C2') >= 20],
  ];

  const newBadges = [];
  for (const [id, ok] of checks) {
    if (ok && !current.includes(id)) {
      current.push(id);
      newBadges.push(BADGES[id]);
    }
  }
  if (newBadges.length) {
    await supabase.from('profiles').update({ badges: current }).eq('id', userId);
  }
  return newBadges;
}

export async function getStudentProgress(userId) {
  const profile = await refreshProfile(userId);
  const { data: sessions } = await supabase
    .from('lesson_sessions')
    .select('*')
    .eq('user_id', userId);

  const list = sessions || [];
  const totalMinutes = list.reduce((a, s) => a + (s.duration_minutes || 0), 0);
  const totalCorrections = list.reduce(
    (a, s) => a + (Array.isArray(s.corrections) ? s.corrections.length : 0),
    0
  );
  const streak = calcStreak(list);
  const newBadges = await checkAndAwardBadges(userId, profile, list);
  const badges = (profile.badges || []).map((b) => BADGES[b]).filter(Boolean);

  const levelOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const currentLevel = profile.level || 'A1';
  const idx = levelOrder.indexOf(currentLevel);

  /** Seviye icinde ilerleme: tamamlanan anlamli oturum sayisi (bos oturumlar sayilmaz). */
  const meaningfulSessions = list.filter(
    (s) =>
      (s.duration_minutes || 0) >= 2 ||
      (Array.isArray(s.transcript) && s.transcript.length >= 2)
  );
  const sessionsAtLevel = meaningfulSessions.filter((s) => s.level === currentLevel).length;
  const levelThresholds = { A1: 12, A2: 20, B1: 30, B2: 40, C1: 50, C2: 60 };
  const threshold = levelThresholds[currentLevel] || 12;
  const intraLevelPct = Math.min(100, Math.round((sessionsAtLevel / threshold) * 100));
  const ladderPct = Math.round(((idx + intraLevelPct / 100) / levelOrder.length) * 100);

  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const mins = list
      .filter((s) => parseDate(s.started_at) === key)
      .reduce((a, s) => a + (s.duration_minutes || 0), 0);
    weekly.push({
      day: d.toLocaleDateString('tr-TR', { weekday: 'short' }),
      date: key,
      minutes: Math.round(mins * 10) / 10,
    });
  }

  return {
    total_sessions: list.length,
    total_minutes: Math.round(totalMinutes * 10) / 10,
    total_hours: Math.round((totalMinutes / 60) * 10) / 10,
    total_corrections: totalCorrections,
    current_streak: streak,
    weekly_stats: weekly,
    level: profile.level,
    level_progress: ladderPct,
    level_intra_progress: intraLevelPct,
    sessions_at_level: sessionsAtLevel,
    badges,
    new_badges: newBadges,
    daily_limit: profile.daily_limit_minutes,
    used_today: profile.used_minutes_today,
  };
}

export async function getStudentBadges(userId) {
  const profile = await refreshProfile(userId);
  const { data: sessions } = await supabase
    .from('lesson_sessions')
    .select('id, started_at, duration_minutes, corrections')
    .eq('user_id', userId);
  await checkAndAwardBadges(userId, profile, sessions || []);
  const updated = await refreshProfile(userId);
  const earned = updated.badges || [];
  const badges = Object.values(BADGES).map((b) => ({
    ...b,
    earned: earned.includes(b.id),
  }));
  return {
    earned_count: earned.length,
    total_count: Object.keys(BADGES).length,
    badges,
  };
}

export async function getRecentCorrections(userId, limit = 20) {
  const { data: sessions } = await supabase
    .from('lesson_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(50);

  const out = [];
  for (const session of sessions || []) {
    for (const c of session.corrections || []) {
      out.push({
        ...c,
        session_id: session.id,
        level: session.level,
        date: session.ended_at || session.started_at,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
