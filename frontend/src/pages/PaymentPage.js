import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, Check, Clock, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getActivePackages } from '../lib/packagesApi';
import { getAuthHeaders, getAiApiBase } from '../lib/apiAuth';
import axios from 'axios';

export default function PaymentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth() || {};
  const [plans, setPlans] = useState([]);
  const [addons, setAddons] = useState([]);
  const [selected, setSelected] = useState('');
  const [buying, setBuying] = useState(false);
  const [loading, setLoading] = useState(true);

  const status = searchParams.get('status');

  useEffect(() => {
    if (status === 'success') {
      toast.success('Ödeme başarılı! Paket hakkınız güncellendi.');
      refreshUser?.();
    } else if (status === 'failed') {
      toast.error('Ödeme tamamlanamadı. Tekrar deneyin veya destek ile iletişime geçin.');
    }
  }, [status, refreshUser]);

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
          subs.find((p) => p.highlight)?.code || subs[0]?.code || adds[0]?.code || '';
        setSelected(preferred);
      } catch (err) {
        console.error(err);
        toast.error('Paketler yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startIyzicoCheckout = async (packageCode) => {
    if (!user) {
      toast.info('Satın almak için giriş yapın');
      navigate('/');
      return;
    }
    setBuying(true);
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.post(
        `${getAiApiBase()}/payments/iyzico/initialize`,
        {
          package_code: packageCode,
          buyer_name: user.name || user.email?.split('@')[0] || 'Musteri',
        },
        { headers }
      );
      if (data?.payment_page_url) {
        window.location.href = data.payment_page_url;
        return;
      }
      if (data?.checkout_form_content) {
        // Embed fallback
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(data.checkout_form_content);
          w.document.close();
        } else {
          toast.error('Ödeme penceresi engellendi — tarayıcı pop-up iznini açın');
        }
        return;
      }
      throw new Error('iyzico yaniti gecersiz');
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || err?.message || 'Ödeme başlatılamadı';
      toast.error(typeof detail === 'string' ? detail : 'Ödeme başlatılamadı');
    } finally {
      setBuying(false);
    }
  };

  const selectedPlan =
    [...plans, ...addons].find((p) => p.code === selected) || null;

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

        {status === 'success' && (
          <div className="mb-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <div>
              <p className="font-medium text-emerald-300">Ödeme başarılı</p>
              <p className="text-sm text-slate-400">Günlük pratik hakkınız güncellendi. Derse başlayabilirsiniz.</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-2">
          <CreditCard className="w-7 h-7 text-indigo-400" />
          <h1 className="text-3xl font-heading">Paketler & Ödeme</h1>
        </div>
        <p className="text-slate-400 mb-8 max-w-2xl">
          Güvenli ödeme <strong className="text-slate-300">iyzico</strong> ile yapılır. Kart bilgileriniz SpeakKing sunucularında tutulmaz.
        </p>

        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Abonelik paketleri</h2>
        {loading ? (
          <p className="text-slate-500 mb-12 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Paketler yükleniyor…
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
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

        {addons.length > 0 && (
          <>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Bugüne özel ekstra süre
            </h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {addons.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => setSelected(a.code)}
                  className={`text-left rounded-2xl border p-5 transition-all ${
                    selected === a.code
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <h3 className="text-base font-medium mb-1">{a.name}</h3>
                  <p className="text-2xl font-bold text-amber-300">
                    {Number(a.price_tl).toLocaleString('tr-TR')} TL
                  </p>
                  <p className="text-xs text-slate-500 mt-1">+{a.daily_minutes} dakika bugünkü kota</p>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <Button
            onClick={() => selectedPlan && startIyzicoCheckout(selectedPlan.code)}
            disabled={buying || !selectedPlan}
            className="bg-indigo-600 hover:bg-indigo-500 rounded-full px-8 h-12 text-base"
          >
            {buying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> iyzico açılıyor…
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                {selectedPlan
                  ? `iyzico ile öde — ${Number(selectedPlan.price_tl).toLocaleString('tr-TR')} TL`
                  : 'Paket seçin'}
              </>
            )}
          </Button>
          <p className="text-xs text-slate-500 max-w-sm">
            Ödeme sonrası otomatik yönlendirilirsiniz; kota anında artar.
          </p>
        </div>
      </div>
    </div>
  );
}
