import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { ensureProfile, mapProfileToUser, updateProfileLevel, refreshProfile } from '../lib/profiles';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export function getAuthErrorMessage(error) {
  return error?.message || 'Islem basarisiz';
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(async (session) => {
    if (!session?.user) {
      setToken(null);
      setUser(null);
      localStorage.removeItem('speakking_token');
      return;
    }
    const profile = await ensureProfile(session.user);
    const userData = mapProfileToUser(profile, session.user);
    localStorage.setItem('speakking_token', session.access_token);
    setToken(session.access_token);
    setUser(userData);
  }, []);

  useEffect(() => {
    if (!isSupabaseEnabled || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) applySession(data.session).finally(() => mounted && setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const login = async (email, password) => {
    if (!supabase) throw new Error('REACT_APP_SUPABASE_URL ve ANON_KEY gerekli');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applySession(data.session);
    const profile = await ensureProfile(data.user);
    return mapProfileToUser(profile, data.user);
  };

  const register = async (name, email, password) => {
    if (!supabase) throw new Error('Supabase yapilandirilmadi');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    if (!data.session) {
      throw new Error('Kayit alindi. E-posta onayi aciksa mailinizi kontrol edin.');
    }
    await applySession(data.session);
    const profile = await ensureProfile(data.user);
    return mapProfileToUser(profile, data.user);
  };

  const logout = async () => {
    await supabase?.auth.signOut();
    localStorage.removeItem('speakking_token');
    setToken(null);
    setUser(null);
  };

  const updateLevel = async (level) => {
    if (!user?.id) return;
    await updateProfileLevel(user.id, level);
    const profile = await refreshProfile(user.id);
    setUser(mapProfileToUser(profile, { email: user.email }));
  };

  const refreshUser = async () => {
    if (!user?.id) return;
    const profile = await refreshProfile(user.id);
    setUser(mapProfileToUser(profile, { email: user.email }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        updateLevel,
        refreshUser,
        isSupabase: true,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
