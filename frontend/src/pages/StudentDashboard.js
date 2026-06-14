import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, Trophy, Flame, Clock, Target,
  BookOpen, Star, Award, TrendingUp, Calendar,
  Volume2, ChevronRight, Lock
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';

import { getStudentProgress, getStudentBadges, getRecentCorrections } from '../lib/studentApi';
import { getAuthHeaders, getAiApiBase } from '../lib/apiAuth';

// Speaky Character - Realistic 3D Style
const SpeakyCharacter = ({ size = "md", mood = "happy" }) => {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
    xl: "w-48 h-48"
  };

  return (
    <div className={`${sizeClasses[size]} relative`}>
      <img 
        src="https://images.unsplash.com/photo-1656229181541-a42184b5625c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHw0fHxmcmllbmRseSUyMGZlbWFsZSUyMEFJJTIwYXNzaXN0YW50JTIwYXZhdGFyJTIwM0QlMjBjaGFyYWN0ZXJ8ZW58MHx8fHwxNzc1NDU5MzgwfDA&ixlib=rb-4.1.0&q=85&w=400"
        alt="Speaky"
        className="w-full h-full object-cover rounded-full border-4 border-indigo-500/50 shadow-lg shadow-indigo-500/30"
      />
      <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
        <span className="text-xs">✓</span>
      </div>
    </div>
  );
};

// Badge Icon Component
const BadgeIcon = ({ icon, color, earned = false }) => {
  const iconMap = {
    rocket: "🚀",
    flame: "🔥",
    crown: "👑",
    trophy: "🏆",
    book: "📚",
    target: "🎯",
    clock: "⏰",
    star: "⭐",
    medal: "🏅",
    award: "🎖️",
    gem: "💎"
  };

  const colorClasses = {
    emerald: "from-emerald-500 to-emerald-600",
    orange: "from-orange-500 to-orange-600",
    yellow: "from-yellow-400 to-yellow-500",
    purple: "from-purple-500 to-purple-600",
    blue: "from-blue-500 to-blue-600",
    red: "from-red-500 to-red-600",
    indigo: "from-indigo-500 to-indigo-600",
    amber: "from-amber-400 to-amber-500",
    gold: "from-yellow-400 to-amber-500",
    teal: "from-teal-500 to-teal-600",
    cyan: "from-cyan-500 to-cyan-600",
    violet: "from-violet-500 to-violet-600",
    pink: "from-pink-500 to-pink-600"
  };

  return (
    <div className={`
      w-14 h-14 rounded-xl flex items-center justify-center text-2xl
      ${earned 
        ? `bg-gradient-to-br ${colorClasses[color] || colorClasses.indigo} shadow-lg` 
        : 'bg-slate-800/50 grayscale opacity-40'
      }
    `}>
      {earned ? iconMap[icon] || "🏆" : <Lock className="w-5 h-5 text-slate-600" />}
    </div>
  );
};

// Weekly Chart Component
const WeeklyChart = ({ data }) => {
  const maxMinutes = Math.max(...data.map(d => d.minutes), 1);

  return (
    <div className="flex items-end justify-between gap-2 h-32">
      {data.map((day, index) => (
        <div key={index} className="flex-1 flex flex-col items-center gap-1">
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${(day.minutes / maxMinutes) * 100}%` }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            className="w-full bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-lg min-h-[4px]"
            style={{ minHeight: day.minutes > 0 ? '8px' : '4px' }}
          />
          <span className="text-xs text-slate-500">{day.day}</span>
        </div>
      ))}
    </div>
  );
};

// Correction Card with Voice
const CorrectionReviewCard = ({ correction, token }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const playCorrection = async () => {
    try {
      setIsPlaying(true);
      const text = `Yanlış: ${correction.original}. Doğrusu: ${correction.correction}`;
      const headers = await getAuthHeaders();
      const response = await axios.post(
        `${getAiApiBase()}/voice/speak?text=${encodeURIComponent(text)}&voice=nova`,
        {},
        { headers }
      );
      
      const audio = new Audio(`data:audio/mp3;base64,${response.data.audio}`);
      audio.onended = () => setIsPlaying(false);
      audio.play();
    } catch (error) {
      console.error('TTS error:', error);
      setIsPlaying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-4 border-l-4 border-emerald-500"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">
              {correction.level}
            </span>
            <span className="text-xs text-slate-500">
              {correction.date ? new Date(correction.date).toLocaleDateString('tr-TR') : ''}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-slate-400 line-through">{correction.original}</p>
            <p className="text-sm text-white font-medium">{correction.correction}</p>
          </div>
          {correction.explanation && (
            <p className="text-xs text-slate-500 mt-2">{correction.explanation}</p>
          )}
        </div>
        <button
          onClick={playCorrection}
          disabled={isPlaying}
          className="p-2 rounded-full bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors"
        >
          <Volume2 className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
        </button>
      </div>
    </motion.div>
  );
};

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [progress, setProgress] = useState(null);
  const [badges, setBadges] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    if (!user?.id) return;
    try {
      const [progressData, badgesData, correctionsData] = await Promise.all([
        getStudentProgress(user.id),
        getStudentBadges(user.id),
        getRecentCorrections(user.id, 20),
      ]);

      setProgress(progressData);
      setBadges(badgesData);
      setCorrections(correctionsData);

      if (progressData.new_badges?.length > 0) {
        progressData.new_badges.forEach((badge) => {
          toast.success(`🎉 Yeni Rozet: ${badge.name}`, {
            description: badge.description
          });
        });
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0E] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Geri Dön</span>
            </button>
            <h1 className="text-xl font-heading font-semibold text-white">İlerleme Durumum</h1>
            <div className="w-24" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-6 mb-8"
        >
          <div className="flex items-center gap-6">
            <SpeakyCharacter size="lg" />
            <div className="flex-1">
              <h2 className="text-2xl font-heading font-medium text-white mb-1">
                Merhaba, {user?.name}! 👋
              </h2>
              <p className="text-slate-400 mb-4">
                Bugün pratik yaparak İngilizceni geliştirmeye devam et!
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <span className="text-white font-medium">{progress?.current_streak || 0} gün seri</span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  <span className="text-white font-medium">{badges?.earned_count || 0} rozet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-400" />
                  <span className="text-white font-medium">{progress?.total_hours || 0} saat</span>
                </div>
              </div>
            </div>
            <Button
              onClick={() => navigate('/')}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-6"
              data-testid="start-practice-btn"
            >
              Pratik Yap
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: BookOpen, label: 'Toplam Ders', value: progress?.total_sessions || 0, color: 'indigo' },
            { icon: Clock, label: 'Toplam Süre', value: `${progress?.total_minutes || 0} dk`, color: 'emerald' },
            { icon: Target, label: 'Düzeltme', value: progress?.total_corrections || 0, color: 'orange' },
            { icon: TrendingUp, label: 'Seviye', value: progress?.level || 'A1', color: 'purple' }
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass p-4"
            >
              <stat.icon className={`w-6 h-6 text-${stat.color}-400 mb-2`} />
              <p className="text-2xl font-heading font-semibold text-white">{stat.value}</p>
              <p className="text-sm text-slate-400">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="progress" className="space-y-6">
          <TabsList className="glass p-1">
            <TabsTrigger value="progress" data-testid="progress-tab">İlerleme</TabsTrigger>
            <TabsTrigger value="badges" data-testid="badges-tab">Rozetler</TabsTrigger>
            <TabsTrigger value="corrections" data-testid="corrections-tab">Düzeltmeler</TabsTrigger>
          </TabsList>

          {/* Progress Tab */}
          <TabsContent value="progress">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Weekly Activity */}
              <div className="glass p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-lg font-heading font-medium text-white">Haftalık Aktivite</h3>
                </div>
                {progress?.weekly_stats && (
                  <WeeklyChart data={progress.weekly_stats} />
                )}
              </div>

              {/* Level Progress */}
              <div className="glass p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-heading font-medium text-white">Seviye İlerlemesi</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-3xl font-heading font-bold text-gradient">
                      {progress?.level || 'A1'}
                    </span>
                    <span className="text-sm text-slate-400">
                      {progress?.sessions_at_level != null
                        ? `${progress.sessions_at_level} oturum · ${Math.round(progress.level_intra_progress || 0)}% bu seviyede`
                        : `${Math.round(progress?.level_progress || 0)}% tamamlandı`}
                    </span>
                  </div>
                  <Progress value={progress?.level_intra_progress ?? progress?.level_progress ?? 0} className="h-3 bg-slate-800" />
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>A1</span>
                    <span>A2</span>
                    <span>B1</span>
                    <span>B2</span>
                    <span>C1</span>
                    <span>C2</span>
                  </div>
                </div>
              </div>

              {/* Today's Progress */}
              <div className="glass p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-heading font-medium text-white">Bugünkü Kullanım</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Kullanılan</span>
                    <span className="text-white font-medium">
                      {progress?.used_today || 0} / {progress?.daily_limit || 30} dk
                    </span>
                  </div>
                  <Progress 
                    value={((progress?.used_today || 0) / (progress?.daily_limit || 30)) * 100} 
                    className="h-2 bg-slate-800" 
                  />
                </div>
              </div>

              {/* Streak */}
              <div className="glass p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-5 h-5 text-orange-400" />
                  <h3 className="text-lg font-heading font-medium text-white">Pratik Serisi</h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-4xl font-heading font-bold text-orange-400">
                      {progress?.current_streak || 0}
                    </p>
                    <p className="text-xs text-slate-500">Mevcut</p>
                  </div>
                  <div className="w-px h-12 bg-slate-700" />
                  <div className="text-center">
                    <p className="text-4xl font-heading font-bold text-yellow-400">
                      {progress?.longest_streak || 0}
                    </p>
                    <p className="text-xs text-slate-500">En Uzun</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Badges Tab */}
          <TabsContent value="badges">
            <div className="glass p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-heading font-medium text-white">
                  Rozetlerim ({badges?.earned_count || 0}/{badges?.total_count || 0})
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {badges?.badges?.map((badge) => (
                  <motion.div
                    key={badge.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`
                      p-4 rounded-xl text-center transition-all
                      ${badge.earned 
                        ? 'bg-white/5 hover:bg-white/10' 
                        : 'bg-slate-900/50 opacity-60'
                      }
                    `}
                  >
                    <div className="flex justify-center mb-3">
                      <BadgeIcon icon={badge.icon} color={badge.color} earned={badge.earned} />
                    </div>
                    <p className={`text-sm font-medium ${badge.earned ? 'text-white' : 'text-slate-600'}`}>
                      {badge.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{badge.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Corrections Tab */}
          <TabsContent value="corrections">
            <div className="glass p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-heading font-medium text-white">
                  Son Düzeltmeler
                </h3>
                <span className="text-sm text-slate-400">
                  Sesli dinlemek için 🔊 tıkla
                </span>
              </div>
              {corrections.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Henüz düzeltme yok</p>
                  <p className="text-sm text-slate-500">Pratik yaptıkça düzeltmeler burada görünecek</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4 pr-4">
                    {corrections.map((correction, index) => (
                      <CorrectionReviewCard 
                        key={index} 
                        correction={correction} 
                        token={token}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
