import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Check, Clock, Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

/** Musteri paket listesi — TL/dk birim ucret ile */
const PLANS = [
  {
    id: 'week-15',
    name: 'Haftalık Paket',
    dailyMinutes: 15,
    price: 980,
    perMin: '9,33 TL/dk',
    period: '7 gün',
    features: ['Günlük 15 dk pratik', 'A1–B1 müfredat', 'Video avatar'],
  },
  {
    id: 'week-30',
    name: 'Haftalık Paket',
    dailyMinutes: 30,
    price: 1480,
    perMin: '7,04 TL/dk',
    period: '7 gün',
    features: ['Günlük 30 dk pratik', 'Tüm seviyeler', 'Video avatar'],
    highlight: true,
  },
  {
    id: 'month-15',
    name: 'Aylık Paket',
    dailyMinutes: 15,
    price: 1980,
    perMin: '4,40 TL/dk',
    period: '30 gün',
    features: ['Günlük 15 dk pratik', 'A1–B2 müfredat', 'Öncelikli destek'],
  },
  {
    id: 'month-30',
    name: 'Aylık Paket',
    dailyMinutes: 30,
    price: 2480,
    perMin: '2,75 TL/dk',
    period: '30 gün',
    features: ['Günlük 30 dk pratik', 'Tüm seviyeler', 'Öncelikli destek'],
  },
  {
    id: 'year-15',
    name: 'Yıllık Paket',
    dailyMinutes: 15,
    price: 6880,
    perMin: '1,25 TL/dk',
    period: '365 gün',
    features: ['Günlük 15 dk pratik', 'Tüm seviyeler', 'En avantajlı birim'],
  },
  {
    id: 'year-30',
    name: 'Yıllık Paket',
    dailyMinutes: 30,
    price: 8880,
    perMin: '0,81 TL/dk',
    period: '365 gün',
    features: ['Günlük 30 dk pratik', 'Tüm seviyeler', 'En düşük TL/dk'],
  },
];

/** Ayni gun ekstra sure — kota dolunca */
const ADDONS = [
  { id: 'addon-30', minutes: 30, price: 120, label: '+30 dk (bugün)' },
  { id: 'addon-60', minutes: 60, price: 200, label: '+1 saat (bugün)' },
];

export default function PaymentPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth() || {};
  const [selected, setSelected] = useState('week-30');
  const [buying, setBuying] = useState(false);

  const applyDailyBoost = async (extraMinutes) => {
    if (!user?.id || !supabase) {
      toast.info('Giriş yapın, sonra ekstra süre eklenecek.', { duration: 4000 });
      return;
    }
    setBuying(true);
    try {
      const { data: profile, error: rErr } = await supabase
        .from('profiles')
        .select('daily_limit_minutes')
        .eq('id', user.id)
        .single();
      if (rErr) throw rErr;
      const next = (profile?.daily_limit_minutes || 30) + extraMinutes;
      const { error } = await supabase
        .from('profiles')
        .update({ daily_limit_minutes: next })
        .eq('id', user.id);
      if (error) throw error;
      await refreshUser?.();
      toast.success(`Bugüne +${extraMinutes} dk eklendi. Yeni limit: ${next} dk`);
    } catch (err) {
      console.error(err);
      toast.error('Süre eklenemedi — ödeme yakında; şimdilik admin kotayı artırabilir.');
    } finally {
      setBuying(false);
    }
  };

  const checkout = async () => {
    const plan = PLANS.find((p) => p.id === selected);
    if (!plan) return;
    // Birden fazla paket: limitle ust uste binmez — gunluk dakikayi secilen pakete ceker
    // (Stripe gelince siparis kaydi tutulacak; simdi profil limiti guncellenir)
    if (!user?.id || !supabase) {
      toast.info('Ödeme için giriş yapın. Stripe yakında bağlanacak.', { duration: 5000 });
      return;
    }
    setBuying(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ daily_limit_minutes: plan.dailyMinutes })
        .eq('id', user.id);
      if (error) throw error;
      await refreshUser?.();
      toast.success(
        `${plan.name} (${plan.dailyMinutes} dk/gün) aktifleştirildi. Birden fazla paket alabilirsiniz.`,
        { duration: 5000 }
      );
    } catch (err) {
      console.error(err);
      toast.info('Ödeme altyapısı yakında. Stripe bağlandığında buradan tamamlanacak.', {
        duration: 5000,
      });
    } finally {
      setBuying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0E] text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Geri
        </button>
        <div className="flex items-center gap-3 mb-2">
          <CreditCard className="w-7 h-7 text-indigo-400" />
          <h1 className="text-3xl font-heading">Abonelik & Ödeme</h1>
        </div>
        <p className="text-slate-400 mb-8 max-w-2xl">
          İstediğiniz kadar paket alabilirsiniz; bitmesini beklemeniz gerekmez. Kota dolunca aynı güne ekstra süre ekleyin.
        </p>

        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Paketler</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelected(plan.id)}
              className={`text-left rounded-2xl border p-5 transition-all ${
                selected === plan.id
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              } ${plan.highlight ? 'ring-1 ring-indigo-400/40' : ''}`}
            >
              <h3 className="text-base font-medium mb-0.5">{plan.name}</h3>
              <p className="text-xs text-slate-500 mb-2">
                Günlük {plan.dailyMinutes} dk · {plan.period}
              </p>
              <p className="text-2xl font-bold text-indigo-300">
                {plan.price.toLocaleString('tr-TR')} TL
              </p>
              <p className="text-xs text-emerald-400/90 mt-1 mb-3">{plan.perMin}</p>
              <ul className="space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <Button
          onClick={checkout}
          disabled={buying}
          className="bg-indigo-600 hover:bg-indigo-500 rounded-full px-8 mb-14"
        >
          Seçili paketi satınal / yenile
        </Button>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-medium">Bugüne özel ekstra süre</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Günlük kotanız bitti ama devam etmek istiyorsanız +30 dk veya +1 saat ekleyin.
          </p>
          <div className="flex flex-wrap gap-3">
            {ADDONS.map((a) => (
              <Button
                key={a.id}
                type="button"
                disabled={buying}
                onClick={() => applyDailyBoost(a.minutes)}
                className="bg-amber-600 hover:bg-amber-500 rounded-full"
              >
                <Plus className="w-4 h-4 mr-1" />
                {a.label} — {a.price} TL
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
