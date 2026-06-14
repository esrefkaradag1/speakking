import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  Mic, BookOpen, Clock, ChevronRight, LogOut,
  User, Settings, Eye, EyeOff, Sparkles, Trophy
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';

import { getScenarios, startLesson as createLessonSession } from '../lib/lessonApi';
import { getCurriculumCategories, getCurriculumModules, moduleDisplayName } from '../lib/curriculumApi';
import { isWordBuildLesson, parseScenarioTopics } from '../lib/customLesson';
import { categoryColors } from '../lib/curriculumLevels';
import { getAuthErrorMessage } from '../context/AuthContext';

// Speaky - Realistic 3D Character
const SpeakyCharacter = ({ size = "md", isAnimated = false }) => {
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32",
    xl: "w-40 h-40"
  };

  return (
    <motion.div
      className={`${sizeClasses[size]} relative`}
      animate={isAnimated ? { y: [0, -8, 0] } : {}}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <img
        src="https://images.unsplash.com/photo-1656229181541-a42184b5625c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHw0fHxmcmllbmRseSUyMGZlbWFsZSUyMEFJJTIwYXNzaXN0YW50JTIwYXZhdGFyJTIwM0QlMjBjaGFyYWN0ZXJ8ZW58MHx8fHwxNzc1NDU5MzgwfDA&ixlib=rb-4.1.0&q=85&w=400"
        alt="Speaky"
        className="w-full h-full object-cover rounded-full border-4 border-indigo-500/50 shadow-lg shadow-indigo-500/30"
      />
      <motion.div
        className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 rounded-full border-2 border-slate-900 flex items-center justify-center"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Mic className="w-4 h-4 text-white" />
      </motion.div>
    </motion.div>
  );
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, token, login, register, logout, updateLevel } = useAuth();
  const [scenarios, setScenarios] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modules, setModules] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(user?.level || 'A1');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    if (user?.level) {
      setSelectedLevel(user.level);
    }
  }, [user]);

  useEffect(() => {
    fetchCurriculum();
  }, []);

  const fetchCurriculum = async () => {
    try {
      const [scenarioList, categoryList, moduleList] = await Promise.all([
        getScenarios(),
        getCurriculumCategories(),
        getCurriculumModules(),
      ]);
      setScenarios(scenarioList);
      setCategories(categoryList);
      setModules(moduleList);
      const level = categoryList.some((c) => c.code === selectedLevel)
        ? selectedLevel
        : categoryList[0]?.code || 'A1';
      setSelectedLevel(level);
    } catch (error) {
      console.error('Failed to fetch curriculum:', error);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthLoading(true);

    try {
      if (authMode === 'login') {
        await login(formData.email, formData.password);
        toast.success('Tekrar hoş geldin! 🎉');
      } else {
        await register(formData.name, formData.email, formData.password);
        toast.success('Hesabın oluşturuldu! 🎉');
      }
      setShowAuthModal(false);
      setFormData({ name: '', email: '', password: '' });
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLevelSelect = async (level) => {
    setSelectedLevel(level);
    if (user) {
      try {
        await updateLevel(level);
      } catch (error) {
        console.error('Failed to update level:', error);
      }
    }
  };

  const startLesson = async (scenarioId) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    if (user.used_minutes_today >= user.daily_limit_minutes) {
      toast.error('Günlük limitine ulaştın! Yarın tekrar gel. 😊');
      return;
    }

    try {
      const result = await createLessonSession(user.id, scenarioId);
      navigate(`/lesson/${result.session.id}`, {
        state: {
          scenario: result.scenario,
          remainingMinutes: result.remaining_minutes,
        },
      });
    } catch (error) {
      toast.error(error.message || 'Ders baslatilamadi');
    }
  };

  const remainingMinutes = user ? Math.max(0, user.daily_limit_minutes - user.used_minutes_today) : 30;
  const usagePercent = user ? (user.used_minutes_today / user.daily_limit_minutes) * 100 : 0;

  const selectedCategory =
    categories.find((c) => c.code === selectedLevel) || categories[0];
  const catIndex = categories.findIndex((c) => c.code === selectedLevel);
  const levelColors = categoryColors(selectedLevel, catIndex);
  const modulesForLevel = modules
    .filter((m) => m.category_code === selectedLevel)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const scenariosForModule = (moduleId) =>
    scenarios.filter((s) => s.module_id === moduleId);
  const totalTopicsForLevel = modulesForLevel.reduce(
    (n, m) => n + scenariosForModule(m.id).length,
    0
  );

  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="page-background">
        <img
          src="https://images.unsplash.com/photo-1774997391540-dfaf4bf0620b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBncmVlbiUyMGJsdWUlMjB3YXZlc3xlbnwwfHx8fDE3NzU0NTY2MzV8MA&ixlib=rb-4.1.0&q=85"
          alt="Background"
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Speakking AI Logo" className="h-8 object-contain" />
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/progress')}
                    className="text-slate-300 hover:text-white"
                    data-testid="progress-btn"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    İlerlemem
                  </Button>
                  {user.is_admin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/admin')}
                      className="text-slate-300 hover:text-white"
                      data-testid="admin-btn"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Yönetim
                    </Button>
                  )}
                  <div className="flex items-center gap-2 glass px-3 py-2">
                    <User className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm text-white">{user.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={logout}
                    className="text-slate-400 hover:text-white"
                    data-testid="logout-btn"
                    title="Çıkış Yap"
                  >
                    <LogOut className="w-5 h-5" />
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-6"
                  data-testid="auth-btn"
                >
                  Başla
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          {/* Speaky Character */}
          <div className="flex justify-center mb-6">
            <SpeakyCharacter size="xl" isAnimated />
          </div>

          <div className="inline-flex items-center gap-2 glass px-4 py-2 mb-6">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold tracking-widest uppercase text-indigo-400">
              Yapay Zeka Destekli İngilizce Koçu
            </span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-heading font-medium tracking-tight text-white mb-4">
            <span className="text-gradient">Konuşarak</span> İngilizce Öğren
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            Speaky ile Türkçe cümleleri İngilizceye çevir ve anında geri bildirim al.
            Akıcılığını ve doğruluğunu geliştirmek için mükemmel!
          </p>
        </motion.div>

        {/* Usage Stats */}
        {user && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass p-6 mb-12 max-w-md mx-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                <span className="text-sm font-medium text-white">Günlük Pratik Süresi</span>
              </div>
              <span className="text-sm text-slate-300">
                {Math.round(remainingMinutes)} dk kaldı
              </span>
            </div>
            <Progress value={usagePercent} className="h-2 bg-slate-800" />
            <p className="text-xs text-slate-500 mt-2">
              Bugün {Math.round(user.used_minutes_today)} / {user.daily_limit_minutes} dakika kullanıldı
            </p>
          </motion.div>
        )}

        {/* Level Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-heading font-medium text-white text-center mb-6">
            Seviyeni Seç
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map((cat) => (
              <button
                key={cat.code}
                onClick={() => handleLevelSelect(cat.code)}
                className={`
                  px-6 py-3 rounded-full font-medium transition-all duration-300
                  ${selectedLevel === cat.code
                    ? 'bg-indigo-600 text-white glow-indigo'
                    : 'glass text-slate-300 hover:text-white glass-hover'
                  }
                `}
                data-testid={`level-${cat.code}-btn`}
              >
                <span className="font-bold">{cat.code}</span>
                <span className="text-sm ml-2 opacity-75">{cat.name_tr}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Alt kutular — admin ile aynı kart düzeni */}
        <AnimatePresence mode="wait">
          <motion.section
            key={selectedLevel}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className={`glass border-t-4 ${levelColors.border} rounded-xl overflow-hidden max-w-6xl mx-auto`}
          >
            <div className={`p-4 ${levelColors.bg} border-b border-white/10`}>
              <span className={`text-xl font-bold ${levelColors.text}`}>{selectedLevel}</span>
              <span className="text-sm text-slate-400 ml-2">
                {selectedCategory?.name_tr}
                {selectedCategory?.name_en && selectedCategory.name_en !== selectedCategory.name_tr
                  ? ` · ${selectedCategory.name_en}`
                  : ''}
              </span>
              <p className="text-xs text-slate-500 mt-1">
                {modulesForLevel.length} alt kutu · {totalTopicsForLevel} konu
              </p>
            </div>

            {modulesForLevel.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Bu seviye için henüz alt kutu eklenmemiş
              </div>
            ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {modulesForLevel.map((mod) => {
                  const modScenarios = scenariosForModule(mod.id);
                  return (
                    <div
                      key={mod.id}
                      className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col min-h-[140px]"
                    >
                      <div className="p-3 border-b border-white/10">
                        <p className={`text-sm font-semibold ${levelColors.text}`}>
                          {moduleDisplayName(mod, selectedLevel)}
                        </p>
                        <p className="text-xs text-slate-500">{modScenarios.length} konu</p>
                      </div>
                      <div className="p-2 flex-1">
                        {modScenarios.length === 0 ? (
                          <p className="text-xs text-slate-600 text-center py-4">Konu yok</p>
                        ) : (
                          modScenarios.map((scenario) => (
                            <button
                              key={scenario.id}
                              type="button"
                              onClick={() => startLesson(scenario.id)}
                              className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-white/5 transition-colors group text-left"
                              data-testid={`scenario-card-${scenario.id}`}
                            >
                              <span className="text-sm text-slate-300 group-hover:text-white">
                                {scenario.title_tr}
                                {isWordBuildLesson(scenario.topics) && (
                                  <span className="block text-[10px] text-indigo-400/90 mt-0.5">
                                    {parseScenarioTopics(scenario.topics).words.join(', ')}
                                  </span>
                                )}
                              </span>
                              <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      {/* Auth Modal */}
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <SpeakyCharacter size="md" isAnimated />
            </div>
            <DialogTitle className="text-2xl font-heading text-white text-center">
              {authMode === 'login' ? 'Tekrar Hoş Geldin!' : 'Hesap Oluştur'}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-center">
              {authMode === 'login'
                ? 'İngilizce pratiğine devam etmek için giriş yap'
                : 'Pratiğe başlamak için hesap oluştur'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAuth} className="space-y-4 mt-4">
            {authMode === 'register' && (
              <div>
                <Label htmlFor="name" className="text-slate-300">Adın</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white mt-1"
                  placeholder="Adını gir"
                  required
                  data-testid="auth-name-input"
                />
              </div>
            )}

            <div>
              <Label htmlFor="email" className="text-slate-300">E-posta</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1"
                placeholder="ornek@email.com"
                required
                data-testid="auth-email-input"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-slate-300">Şifre</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white mt-1 pr-10"
                  placeholder="••••••••"
                  required
                  data-testid="auth-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={authLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-full py-6"
              data-testid="auth-submit-btn"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                authMode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'
              )}
            </Button>
          </form>

          <div className="text-center mt-4">
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-sm text-slate-400 hover:text-indigo-400 transition-colors"
              data-testid="auth-switch-btn"
            >
              {authMode === 'login'
                ? "Hesabın yok mu? Kayıt ol"
                : 'Zaten hesabın var mı? Giriş yap'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
