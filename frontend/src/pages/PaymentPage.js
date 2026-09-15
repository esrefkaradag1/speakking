import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

const PLANS = [
  {
    id: 'starter',
    name: 'Baslangic',
    price: '299 TL',
    period: '/ ay',
    features: ['Gunluk 30 dk pratik', 'A1–A2 mudfredat', 'Temel avatar'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '599 TL',
    period: '/ ay',
    features: ['Gunluk 90 dk pratik', 'Tum seviyeler', 'Gorsel + dudak senkronu', 'Oncelikli destek'],
    highlight: true,
  },
  {
    id: 'school',
    name: 'Okul',
    price: 'Teklif',
    period: '',
    features: ['Sinifsiz ogrenci', 'Ogretmen paneli', 'Ozel avatar', 'Fatura'],
  },
];

export default function PaymentPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState('pro');

  const checkout = () => {
    toast.info('Odeme altyapisi yakinda aktif olacak. Stripe baglantisi bekleniyor.', {
      duration: 5000,
    });
  };

  return (
    <div className="min-h-screen bg-[#0A0A0E] text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Geri
        </button>
        <div className="flex items-center gap-3 mb-2">
          <CreditCard className="w-7 h-7 text-indigo-400" />
          <h1 className="text-3xl font-heading">Abonelik & Odeme</h1>
        </div>
        <p className="text-slate-400 mb-10 max-w-xl">
          Paketinizi secin. Odeme altyapisi (Stripe) baglandiginda burada tamamlanacak.
        </p>
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelected(plan.id)}
              className={`text-left rounded-2xl border p-6 transition-all ${
                selected === plan.id
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              } ${plan.highlight ? 'ring-1 ring-indigo-400/40' : ''}`}
            >
              <h2 className="text-lg font-medium mb-1">{plan.name}</h2>
              <p className="text-2xl font-bold text-indigo-300 mb-4">
                {plan.price}
                <span className="text-sm font-normal text-slate-500">{plan.period}</span>
              </p>
              <ul className="space-y-2 mb-4">
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
        <div className="mt-8">
          <Button
            onClick={checkout}
            className="bg-indigo-600 hover:bg-indigo-500 rounded-full px-8"
          >
            Secili paketi satin al
          </Button>
        </div>
      </div>
    </div>
  );
}
