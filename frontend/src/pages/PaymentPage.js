import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Check, Clock, Plus } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getActivePackages } from '../lib/packagesApi';

export default function PaymentPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth() || {};
  const [plans, setPlans] = useState([]);
  const [addons, setAddons] = useState([]);
  const [selected, setSelected] = useState('');
  const [buying, setBuying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getActivePackages();
        if (cancelled) return;
        const subs = all.filter((p) => p.package_type !== 'addon');
        const adds = all.filter((p) => p.package_type === 'addon');
        setPlans(subs);
        setAddons(adds);
        const preferred =
          subs.find((p) => p.highlight)?.code || subs[0]?.code || '';
        setSelected(preferred);
      } catch (err) {
        console.error(err);
        toast.error('Paketler yuklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const plan = plans.find((p) => p.code === selected);
    if (!plan) return;
    if (!user?.id || !supabase) {
      toast.info('Ödeme için giriş yapın. Stripe yakında bağlanacak.', { duration: 5000 });
      return;
    }
    setBuying(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ daily_limit_minutes: plan.daily_minutes })
        .eq('id', user.id);
      if (error) throw error;
      await refreshUser?.();
      toast.success(
        `${plan.name} (${plan.daily_minutes} dk/gün) aktifleştirildi. Birden fazla paket alabilirsiniz.`,
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
        {loading ? (
          <p className="text-slate-500 mb-12">Paketler yükleniyor…</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {plans.map((plan) => (
              <button
                key={plan.code}
                type="button"
                onClick={() => setSelected(plan.code)}
                className={`text-left rounded-2xl border p-5 transition-all ${
                  selected === plan.code
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                } ${plan.highlight ? 'ring-1 ring-indigo-400/40' : ''}`}
              >
                <h3 className="text-base font-medium mb-0.5">{plan.name}</h3>
                <p className="text-xs text-slate-500 mb-2">
                  Günlük {plan.daily_minutes} dk
                  {plan.period_label ? ` · ${plan.period_label}` : ''}
                </p>
                <p className="text-2xl font-bold text-indigo-300">
                  {Number(plan.price_tl).toLocaleString('tr-TR')} TL
                </p>
                {plan.per_min_label && (
                  <p className="text-xs text-emerald-400/90 mt-1 mb-3">{plan.per_min_label}</p>
                )}
                <ul className="space-y-1.5 mt-3">
                  {(plan.features || []).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        )}

        <Button
          onClick={checkout}
          disabled={buying || !selected}
          className="bg-indigo-600 hover:bg-indigo-500 rounded-full px-8 mb-14"
        >
          Seçili paketi satınal / yenile
        </Button>

        {addons.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-medium">Bugüne özel ekstra süre</h2>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Günlük kotanız bitti ama devam etmek istiyorsanız ekstra süre ekleyin.
            </p>
            <div className="flex flex-wrap gap-3">
              {addons.map((a) => (
                <Button
                  key={a.code}
                  type="button"
                  disabled={buying}
                  onClick={() => applyDailyBoost(a.daily_minutes)}
                  className="bg-amber-600 hover:bg-amber-500 rounded-full"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {a.name} — {Number(a.price_tl).toLocaleString('tr-TR')} TL
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
