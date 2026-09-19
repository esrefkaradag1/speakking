import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, CreditCard, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  getPackagesAdmin,
  createPackage,
  updatePackage,
  deletePackage,
} from '../lib/packagesApi';

const emptyForm = () => ({
  code: '',
  name: '',
  package_type: 'subscription',
  daily_minutes: 30,
  price_tl: 0,
  period_label: '',
  per_min_label: '',
  featuresText: '',
  highlight: false,
  is_active: true,
  sort_order: 0,
});

function toForm(pkg) {
  return {
    code: pkg.code || '',
    name: pkg.name || '',
    package_type: pkg.package_type || 'subscription',
    daily_minutes: pkg.daily_minutes ?? 30,
    price_tl: pkg.price_tl ?? 0,
    period_label: pkg.period_label || '',
    per_min_label: pkg.per_min_label || '',
    featuresText: (pkg.features || []).join('\n'),
    highlight: !!pkg.highlight,
    is_active: pkg.is_active !== false,
    sort_order: pkg.sort_order ?? 0,
  };
}

function fromForm(form) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    package_type: form.package_type,
    daily_minutes: Number(form.daily_minutes) || 1,
    price_tl: Number(form.price_tl) || 0,
    period_label: form.period_label.trim(),
    per_min_label: form.per_min_label.trim(),
    features: String(form.featuresText || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    highlight: !!form.highlight,
    is_active: !!form.is_active,
    sort_order: Number(form.sort_order) || 0,
  };
}

export default function PackageManager() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // null | 'new' | package
  const [form, setForm] = useState(emptyForm());

  const load = async () => {
    setLoading(true);
    try {
      const rows = await getPackagesAdmin();
      setPackages(rows);
    } catch (err) {
      console.error(err);
      toast.error(
        err?.message?.includes('relation') || err?.code === '42P01'
          ? 'packages tablosu yok — SQL: supabase/packages.sql'
          : err?.message || 'Paketler yuklenemedi'
      );
      setPackages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing('new');
    setForm(emptyForm());
  };

  const openEdit = (pkg) => {
    setEditing(pkg);
    setForm(toForm(pkg));
  };

  const closeModal = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const save = async () => {
    const payload = fromForm(form);
    if (!payload.code || !payload.name) {
      toast.error('Kod ve isim zorunlu');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await createPackage(payload);
        toast.success('Paket eklendi');
      } else {
        await updatePackage(editing.id, payload);
        toast.success('Paket guncellendi');
      }
      closeModal();
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (pkg) => {
    try {
      await updatePackage(pkg.id, { is_active: !pkg.is_active });
      await load();
    } catch (err) {
      toast.error(err?.message || 'Guncellenemedi');
    }
  };

  const remove = async (pkg) => {
    if (!window.confirm(`"${pkg.name}" silinsin mi?`)) return;
    try {
      await deletePackage(pkg.id);
      toast.success('Paket silindi');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Silinemedi');
    }
  };

  const subs = packages.filter((p) => p.package_type !== 'addon');
  const adds = packages.filter((p) => p.package_type === 'addon');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-medium text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-400" />
            Paket Yonetimi
          </h2>
          <p className="text-sm text-slate-400">
            Odeme sayfasindaki abonelik ve ekstra sure paketlerini duzenleyin. Once{' '}
            <code className="text-amber-400/90">supabase/packages.sql</code> calistirin.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
          <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-500">
            <Plus className="w-4 h-4 mr-2" />
            Yeni Paket
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Yukleniyor…</p>
      ) : (
        <>
          <section className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Abonelik paketleri ({subs.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-white/5">
                    <th className="p-3">Kod</th>
                    <th className="p-3">Ad</th>
                    <th className="p-3">Dk/gun</th>
                    <th className="p-3">Fiyat</th>
                    <th className="p-3">TL/dk</th>
                    <th className="p-3">Aktif</th>
                    <th className="p-3">Sira</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {subs.map((pkg) => (
                    <tr key={pkg.id || pkg.code} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 font-mono text-xs text-indigo-300">{pkg.code}</td>
                      <td className="p-3 text-white">
                        {pkg.name}
                        {pkg.highlight && (
                          <span className="ml-2 text-[10px] text-amber-400">öne çıkan</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-300">{pkg.daily_minutes}</td>
                      <td className="p-3 text-slate-300">
                        {Number(pkg.price_tl).toLocaleString('tr-TR')} TL
                      </td>
                      <td className="p-3 text-emerald-400/90 text-xs">{pkg.per_min_label || '—'}</td>
                      <td className="p-3">
                        <Switch checked={pkg.is_active} onCheckedChange={() => toggleActive(pkg)} />
                      </td>
                      <td className="p-3 text-slate-500">{pkg.sort_order}</td>
                      <td className="p-3 text-right space-x-2">
                        <Button size="sm" variant="outline" className="border-white/20" onClick={() => openEdit(pkg)}>
                          Duzenle
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-400" onClick={() => remove(pkg)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!subs.length && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        Abonelik paketi yok
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Ekstra sure (addon) ({adds.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-white/5">
                    <th className="p-3">Kod</th>
                    <th className="p-3">Ad</th>
                    <th className="p-3">Dk</th>
                    <th className="p-3">Fiyat</th>
                    <th className="p-3">Aktif</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {adds.map((pkg) => (
                    <tr key={pkg.id || pkg.code} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 font-mono text-xs text-amber-300">{pkg.code}</td>
                      <td className="p-3 text-white">{pkg.name}</td>
                      <td className="p-3 text-slate-300">+{pkg.daily_minutes}</td>
                      <td className="p-3 text-slate-300">
                        {Number(pkg.price_tl).toLocaleString('tr-TR')} TL
                      </td>
                      <td className="p-3">
                        <Switch checked={pkg.is_active} onCheckedChange={() => toggleActive(pkg)} />
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <Button size="sm" variant="outline" className="border-white/20" onClick={() => openEdit(pkg)}>
                          Duzenle
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-400" onClick={() => remove(pkg)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!adds.length && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        Addon yok
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Yeni paket' : 'Paketi duzenle'}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Degisiklikler odeme sayfasina aninda yansir (aktif paketler).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kod *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="bg-black/40 border-white/10"
                  placeholder="week-30"
                />
              </div>
              <div>
                <Label>Tip</Label>
                <Select
                  value={form.package_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, package_type: v }))}
                >
                  <SelectTrigger className="bg-black/40 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subscription">Abonelik</SelectItem>
                    <SelectItem value="addon">Ekstra sure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Ad *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-black/40 border-white/10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{form.package_type === 'addon' ? 'Dakika (+)' : 'Gunluk dakika'}</Label>
                <Input
                  type="number"
                  value={form.daily_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, daily_minutes: e.target.value }))}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div>
                <Label>Fiyat (TL)</Label>
                <Input
                  type="number"
                  value={form.price_tl}
                  onChange={(e) => setForm((f) => ({ ...f, price_tl: e.target.value }))}
                  className="bg-black/40 border-white/10"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sure etiketi</Label>
                <Input
                  value={form.period_label}
                  onChange={(e) => setForm((f) => ({ ...f, period_label: e.target.value }))}
                  className="bg-black/40 border-white/10"
                  placeholder="7 gün"
                />
              </div>
              <div>
                <Label>Birim ucret (TL/dk)</Label>
                <Input
                  value={form.per_min_label}
                  onChange={(e) => setForm((f) => ({ ...f, per_min_label: e.target.value }))}
                  className="bg-black/40 border-white/10"
                  placeholder="7,04 TL/dk"
                />
              </div>
            </div>
            <div>
              <Label>Ozellikler (her satir bir madde)</Label>
              <textarea
                value={form.featuresText}
                onChange={(e) => setForm((f) => ({ ...f, featuresText: e.target.value }))}
                className="w-full min-h-[100px] rounded-md bg-black/40 border border-white/10 p-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sira</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  className="bg-black/40 border-white/10"
                />
              </div>
              <div className="flex flex-col gap-3 pt-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.highlight}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, highlight: v }))}
                  />
                  One cikan
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                  />
                  Aktif
                </label>
              </div>
            </div>
            <Button onClick={save} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-500">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
