import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, Users, BookOpen, Clock, Activity,
  Plus, Trash2, Save, Settings, X, GraduationCap,
  FileText, Brain, Upload, Download, Search, Filter, ChevronDown,
  RotateCcw, Bot, MessageSquare, CheckCircle2, AlertCircle, Send, RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { Slider } from '../components/ui/slider';

import * as adminApi from '../lib/adminApi';
import * as curriculumApi from '../lib/curriculumApi';
import { categoryColors, normalizeCategoryCode } from '../lib/curriculumLevels';
import { moduleDisplayName } from '../lib/curriculumApi';
import {
  buildWordBuildTopics,
  defaultCustomLessonForm,
  isWordBuildLesson,
  parseWordsFromText,
} from '../lib/customLesson';
import { Textarea } from '../components/ui/textarea';
import {
  analyzeInstructionDiff,
  appendInstruction,
  buildAssistantMessages,
  buildContextBlocks,
  statusClass,
  statusLabel,
} from '../lib/promptAssistant';
import { fetchPromptStatus } from '../lib/promptStatusApi';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const LEVEL_COLORS = {
  A1: { border: 'border-t-teal-500', bg: 'bg-teal-500/10', text: 'text-teal-400' },
  A2: { border: 'border-t-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  B1: { border: 'border-t-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  B2: { border: 'border-t-cyan-500', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  C1: { border: 'border-t-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  C2: { border: 'border-t-pink-500', bg: 'bg-pink-500/10', text: 'text-pink-400' }
};

const LEVEL_NAMES = {
  A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate',
  B2: 'Upper-Int', C1: 'Advanced', C2: 'Mastery'
};

// ==================== SENTENCE BANK TAB ====================
function SentenceBankTab() {
  const [sentences, setSentences] = useState([]);
  const [filterLevel, setFilterLevel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingSentence, setEditingSentence] = useState(null);
  const [form, setForm] = useState({ turkish: '', english: '', level: 'A1', topic: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkLevel, setBulkLevel] = useState('A1');
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchSentences(); }, [filterLevel]);

  const fetchSentences = async () => {
    try {
      setSentences(await adminApi.getSentences(filterLevel));
    } catch { toast.error('Cumleler yuklenemedi'); }
  };

  const saveSentence = async () => {
    if (!form.turkish.trim() || !form.english.trim()) { toast.error('Turkce ve Ingilizce gerekli'); return; }
    setLoading(true);
    try {
      if (editingSentence) {
        await adminApi.updateSentence(editingSentence.id, form);
        toast.success('Cumle guncellendi');
      } else {
        await adminApi.createSentence(form);
        toast.success('Cumle eklendi');
      }
      setShowAddModal(false);
      setEditingSentence(null);
      setForm({ turkish: '', english: '', level: 'A1', topic: '' });
      fetchSentences();
    } catch { toast.error('Islem basarisiz'); }
    setLoading(false);
  };

  const deleteSentence = async (id) => {
    if (!window.confirm('Bu cumleyi silmek istediginize emin misiniz?')) return;
    try {
      await adminApi.deleteSentence(id);
      toast.success('Cumle silindi');
      fetchSentences();
    } catch { toast.error('Silinemedi'); }
  };

  const bulkImport = async () => {
    const lines = bulkText.split('\n').filter(l => l.trim());
    const parsed = [];
    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 2) {
        parsed.push({ turkish: parts[0], english: parts[1], level: bulkLevel, topic: parts[2] || '' });
      }
    }
    if (parsed.length === 0) { toast.error('Gecerli cumle bulunamadi. Format: Turkce | Ingilizce | Konu'); return; }
    setLoading(true);
    try {
      const res = await adminApi.bulkSentences(parsed);
      toast.success(`${res.inserted} cumle eklendi`);
      setShowBulkModal(false);
      setBulkText('');
      fetchSentences();
    } catch { toast.error('Toplu ekleme basarisiz'); }
    setLoading(false);
  };

  const openEdit = (s) => {
    setEditingSentence(s);
    setForm({ turkish: s.turkish, english: s.english, level: s.level, topic: s.topic || '' });
    setShowAddModal(true);
  };

  const filteredSentences = sentences.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return s.turkish.toLowerCase().includes(q) || s.english.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading font-medium text-white">Cumle Bankasi</h2>
          <p className="text-sm text-slate-400">AI'nin ders sirasinda kullanacagi cumle ciftleri</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowBulkModal(true)} variant="outline" className="border-white/10 text-slate-300 hover:bg-white/5" data-testid="bulk-import-btn">
            <Upload className="w-4 h-4 mr-2" />Toplu Ekle
          </Button>
          <Button onClick={() => { setEditingSentence(null); setForm({ turkish: '', english: '', level: 'A1', topic: '' }); setShowAddModal(true); }}
            className="bg-indigo-600 hover:bg-indigo-500" data-testid="add-sentence-btn">
            <Plus className="w-4 h-4 mr-2" />Cumle Ekle
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cumle ara..." className="pl-10 bg-white/5 border-white/10 text-white" data-testid="sentence-search" />
        </div>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-40 bg-white/5 border-white/10 text-white" data-testid="sentence-level-filter">
            <Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Seviye" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tumu</SelectItem>
            {LEVELS.map(l => <SelectItem key={l} value={l}>{l} - {LEVEL_NAMES[l]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Sentence count */}
      <p className="text-xs text-slate-500">{filteredSentences.length} cumle listeleniyor</p>

      {/* Sentence List */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {filteredSentences.length === 0 ? (
          <div className="glass p-8 text-center">
            <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Henuz cumle eklenmemis</p>
            <p className="text-xs text-slate-500 mt-1">Yukardaki butonlarla cumle ekleyebilirsiniz</p>
          </div>
        ) : (
          filteredSentences.map((s) => (
            <motion.div key={s.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass p-3 flex items-start justify-between gap-3 group hover:bg-white/5 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate"><span className="text-slate-500 mr-1">TR:</span>{s.turkish}</p>
                <p className="text-sm text-emerald-400 truncate"><span className="text-slate-500 mr-1">EN:</span>{s.english}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${LEVEL_COLORS[s.level]?.bg || 'bg-slate-500/10'} ${LEVEL_COLORS[s.level]?.text || 'text-slate-400'}`}>{s.level}</span>
                  {s.topic && <span className="text-[10px] text-slate-500">{s.topic}</span>}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => openEdit(s)} className="p-1.5 text-slate-500 hover:text-blue-400" data-testid={`edit-sentence-${s.id}`}><Save className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteSentence(s.id)} className="p-1.5 text-slate-500 hover:text-red-400" data-testid={`delete-sentence-${s.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">{editingSentence ? 'Cumle Duzenle' : 'Yeni Cumle Ekle'}</DialogTitle>
            <DialogDescription className="text-slate-400">Turkce-Ingilizce cumle cifti</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">Turkce Cumle</Label>
              <Input value={form.turkish} onChange={e => setForm(f => ({...f, turkish: e.target.value}))}
                className="bg-white/5 border-white/10 text-white mt-1" placeholder="Ornegin: Bugun hava cok guzel" data-testid="sentence-turkish-input" />
            </div>
            <div>
              <Label className="text-slate-300">Ingilizce Ceviri</Label>
              <Input value={form.english} onChange={e => setForm(f => ({...f, english: e.target.value}))}
                className="bg-white/5 border-white/10 text-white mt-1" placeholder="e.g. The weather is very nice today" data-testid="sentence-english-input" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-slate-300">Seviye</Label>
                <Select value={form.level} onValueChange={v => setForm(f => ({...f, level: v}))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-slate-300">Konu (Opsiyonel)</Label>
                <Input value={form.topic} onChange={e => setForm(f => ({...f, topic: e.target.value}))}
                  className="bg-white/5 border-white/10 text-white mt-1" placeholder="Greetings" />
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)} className="flex-1">Iptal</Button>
              <Button onClick={saveSentence} disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-500" data-testid="save-sentence-btn">
                <Save className="w-4 h-4 mr-2" />{editingSentence ? 'Guncelle' : 'Ekle'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Modal */}
      <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <DialogContent className="glass border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">Toplu Cumle Ekle</DialogTitle>
            <DialogDescription className="text-slate-400">Her satira bir cumle cifti yazin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">Seviye</Label>
              <Select value={bulkLevel} onValueChange={setBulkLevel}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 mb-2 block">Cumleler (Turkce | Ingilizce | Konu)</Label>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                className="w-full h-48 p-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                placeholder={"Merhaba, nasilsin? | Hello, how are you? | Greetings\nBenim adim Ali | My name is Ali | Introductions\nBugun hava guzel | The weather is nice today | Weather"}
                data-testid="bulk-text-input" />
              <p className="text-xs text-slate-500 mt-1">Format: Turkce | Ingilizce | Konu (konu opsiyonel)</p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowBulkModal(false)} className="flex-1">Iptal</Button>
              <Button onClick={bulkImport} disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-500" data-testid="bulk-import-submit-btn">
                <Upload className="w-4 h-4 mr-2" />Toplu Ekle
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== DOCUMENTS TAB ====================
function DocumentsTab({ userId }) {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [selectedExtractDoc, setSelectedExtractDoc] = useState(null);
  const [extractForm, setExtractForm] = useState({ level: 'A1', topic: '' });
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { fetchDocuments(); }, []);

  const fetchDocuments = async () => {
    try {
      setDocuments(await adminApi.getDocuments());
    } catch { toast.error('Dokumanlar yuklenemedi'); }
  };

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['application/pdf', 'text/plain', 'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) {
      toast.error('Desteklenmeyen dosya tipi. PDF, TXT, CSV veya DOCX yukleyin.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) { toast.error('Dosya 10MB\'dan buyuk olamaz'); return; }
    setUploading(true);
    try {
      await adminApi.uploadDocument(file, userId);
      toast.success('Dokuman yuklendi');
      fetchDocuments();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Yukleme basarisiz');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteDocument = async (id) => {
    if (!window.confirm('Bu dokumani silmek istediginize emin misiniz?')) return;
    try {
      await adminApi.deleteDocument(id);
      toast.success('Dokuman silindi');
      fetchDocuments();
    } catch { toast.error('Silinemedi'); }
  };

  const handleExtractToBank = async (e) => {
    e.preventDefault();
    if (!selectedExtractDoc) return;
    setExtracting(true);
    try {
      const res = await adminApi.extractDocumentToBank(
        selectedExtractDoc.id,
        extractForm.level
      );
      toast.success(`${res.inserted} cumle aktarildi`);
      setShowExtractModal(false);
      setExtractForm({ level: 'A1', topic: '' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Aktarim basarisiz oldu');
    } finally {
      setExtracting(false);
    }
  };

  const previewContent = async (doc) => {
    try {
      setPreviewDoc(await adminApi.getDocumentContent(doc.id));
    } catch { toast.error('Icerik yuklenemedi'); }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const typeIcons = {
    'application/pdf': 'PDF',
    'text/plain': 'TXT',
    'text/csv': 'CSV',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX'
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-heading font-medium text-white">Dokumanlar</h2>
          <p className="text-sm text-slate-400">AI egitimi icin dokuman yukleyin (PDF, TXT, CSV, DOCX)</p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv,.docx" onChange={uploadFile} className="hidden" data-testid="document-file-input" />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="bg-indigo-600 hover:bg-indigo-500" data-testid="upload-document-btn">
            {uploading ? (
              <><span className="animate-spin mr-2">...</span>Yukleniyor</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" />Dokuman Yukle</>
            )}
          </Button>
        </div>
      </div>

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="glass p-8 text-center">
          <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Henuz dokuman yuklenmemis</p>
          <p className="text-xs text-slate-500 mt-1">PDF, TXT, CSV veya DOCX dosyalari yukleyerek AI'yi egitebilirsiniz</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <motion.div key={doc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass p-4 flex items-center justify-between gap-4 group hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0">
                  {typeIcons[doc.content_type] || 'FILE'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{doc.filename}</p>
                  <p className="text-xs text-slate-500">{formatSize(doc.size_bytes)} - {new Date(doc.created_at).toLocaleDateString('tr-TR')}</p>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => { setSelectedExtractDoc(doc); setShowExtractModal(true); }}
                  className="text-slate-400 hover:text-indigo-400 h-8 px-2 flex items-center gap-1" title="Cumle Bankasina Aktar">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  <span className="hidden sm:inline text-xs font-medium text-slate-300">Cumleleri Aktar</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => previewContent(doc)}
                  className="text-slate-400 hover:text-white h-8 px-2" data-testid={`preview-doc-${doc.id}`}>
                  <FileText className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteDocument(doc.id)}
                  className="text-slate-400 hover:text-red-400 h-8 px-2" data-testid={`delete-doc-${doc.id}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="glass border-white/10 max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">{previewDoc?.filename}</DialogTitle>
            <DialogDescription className="text-slate-400">Dokuman icerigi onizlemesi</DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[60vh] overflow-y-auto">
            <pre className="text-sm text-slate-300 whitespace-pre-wrap bg-white/5 p-4 rounded-lg">
              {previewDoc?.text_content || 'Icerik cikarilmadi'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>

      {/* Extract to Bank Modal */}
      <Dialog open={showExtractModal} onOpenChange={setShowExtractModal}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">Cumle Bankasina Aktar</DialogTitle>
            <DialogDescription className="text-slate-400">
              Yapay zeka, bu dokumandaki Turkce-Ingilizce cumle ciftlerini otomatik olarak ayiklayip Cumle Bankasina ekleyecektir.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleExtractToBank} className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">Hedef Seviye</Label>
              <Select value={extractForm.level} onValueChange={v => setExtractForm(f => ({ ...f, level: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Hedef Konu / Kategori</Label>
              <Input value={extractForm.topic} onChange={e => setExtractForm(f => ({ ...f, topic: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1" required placeholder="Orn: Can-Will-Should" />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setShowExtractModal(false)} className="flex-1" disabled={extracting}>Iptal</Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500" disabled={extracting}>
                {extracting ? (
                  <><span className="animate-spin mr-2">...</span>Aktariliyor</>
                ) : (
                  <><Brain className="w-4 h-4 mr-2" />Aktarimi Baslat</>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== AI CONFIG TAB ====================
function AIConfigTab({ categories = [] }) {
  const [config, setConfig] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("Genel");
  const [savedConfig, setSavedConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sentenceCount, setSentenceCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [serverStatus, setServerStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [newInstruction, setNewInstruction] = useState('');
  const [instructionTarget, setInstructionTarget] = useState('notes');

  useEffect(() => {
    fetchConfig();
    fetchCounts();
  }, []);

  const fetchConfig = async () => {
    try {
      const data = await adminApi.getAiConfig();
      setConfig(data);
      setSavedConfig(data);
    } catch {
      toast.error('AI ayarları yüklenemedi');
    }
  };

  const fetchCounts = async () => {
    try {
      const [sentences, docs] = await Promise.all([
        adminApi.getSentences('all'),
        adminApi.getDocuments(),
      ]);
      setSentenceCount(sentences.length);
      setDocCount(docs.length);
    } catch {}
  };

  const refreshServerStatus = async (counts) => {
    setStatusLoading(true);
    try {
      const data = await fetchPromptStatus({
        sentenceCount: counts?.sentenceCount ?? sentenceCount,
        docCount: counts?.docCount ?? docCount,
      });
      setServerStatus(data);
    } catch (err) {
      setServerStatus(null);
      toast.error(err?.message || 'Sunucu durumu alınamadı (AI :8001 çalışıyor mu?)');
    }
    setStatusLoading(false);
  };

  useEffect(() => {
    if (config && savedConfig) {
      refreshServerStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedConfig?.updated_at, sentenceCount, docCount]);

  const currentConfigView = useMemo(() => {
    if (!config) return null;
    if (selectedCategory === "Genel") return config;
    return {
      ...config,
      system_prompt: config.category_overrides?.[selectedCategory]?.system_prompt || '',
      custom_instructions: config.category_overrides?.[selectedCategory]?.custom_instructions || '',
    };
  }, [config, selectedCategory]);

  const savedConfigView = useMemo(() => {
    if (!savedConfig) return null;
    if (selectedCategory === "Genel") return savedConfig;
    return {
      ...savedConfig,
      system_prompt: savedConfig.category_overrides?.[selectedCategory]?.system_prompt || '',
      custom_instructions: savedConfig.category_overrides?.[selectedCategory]?.custom_instructions || '',
    };
  }, [savedConfig, selectedCategory]);

  const hasDraft = useMemo(() => {
    if (!currentConfigView || !savedConfigView) return false;
    return JSON.stringify(currentConfigView) !== JSON.stringify(savedConfigView);
  }, [currentConfigView, savedConfigView]);

  const instructionItems = useMemo(() => {
    if (!currentConfigView || !savedConfigView) return [];
    return analyzeInstructionDiff(currentConfigView, savedConfigView);
  }, [currentConfigView, savedConfigView]);

  const contextBlocks = useMemo(
    () => buildContextBlocks(savedConfigView || currentConfigView, { sentenceCount, docCount }),
    [savedConfigView, currentConfigView, sentenceCount, docCount]
  );

  const assistantMessages = useMemo(
    () => buildAssistantMessages(currentConfigView, savedConfigView, instructionItems, hasDraft),
    [currentConfigView, savedConfigView, instructionItems, hasDraft]
  );

  const appliedOnServer = serverStatus?.instructions?.filter((i) => i.applied) || [];
  const serverBlocks = serverStatus?.blocks || [];

  const saveConfig = async () => {
    setSaving(true);
    try {
      await adminApi.updateAiConfig(config);
      const fresh = await adminApi.getAiConfig();
      setSavedConfig(fresh);
      setConfig(fresh);
      toast.success('Talimatlar kaydedildi — yeni derslerde işlenecek');
      await refreshServerStatus({ sentenceCount, docCount });
    } catch {
      toast.error('Kayıt başarısız');
    }
    setSaving(false);
  };

  const addInstructionFromChat = () => {
    const text = newInstruction.trim();
    if (!text || !config) return;
    setConfig((c) => appendInstruction(c, text, instructionTarget));
    setNewInstruction('');
    toast.success('Taslak listeye eklendi — Kaydet ile derste aktif olur');
  };

  if (!config) return <div className="glass p-8 text-center text-slate-400">Yükleniyor...</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-heading font-medium text-white">Speaky AI Asistanı</h2>
            <p className="text-sm text-slate-400">
              Talimatlarınızın derste işlenip işlenmediğini buradan izleyin
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/20 text-white"
            disabled={statusLoading}
            onClick={() => refreshServerStatus()}
            data-testid="refresh-prompt-status"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${statusLoading ? 'animate-spin' : ''}`} />
            Doğrula
          </Button>
          <Button
            onClick={saveConfig}
            disabled={saving || !hasDraft}
            className="bg-indigo-600 hover:bg-indigo-500"
            data-testid="save-ai-config-btn"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Kaydediliyor...' : hasDraft ? 'Kaydet ve işle' : 'Kayıtlı'}
          </Button>
        </div>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass p-3 border border-emerald-500/20">
          <p className="text-xs text-slate-500">Sunucuda işlenen</p>
          <p className="text-lg font-semibold text-emerald-400">
            {serverStatus?.instruction_count ?? appliedOnServer.length}
          </p>
          <p className="text-[10px] text-slate-600">talimat satırı</p>
        </div>
        <div className="glass p-3 border border-amber-500/20">
          <p className="text-xs text-slate-500">Taslak (kaydedilmedi)</p>
          <p className="text-lg font-semibold text-amber-400">
            {instructionItems.filter((i) => i.status === 'draft').length}
          </p>
        </div>
        <div className="glass p-3">
          <p className="text-xs text-slate-500">Cümle bankası</p>
          <p className="text-lg font-semibold text-white">{sentenceCount}</p>
        </div>
        <div className="glass p-3">
          <p className="text-xs text-slate-500">Doküman</p>
          <p className="text-lg font-semibold text-white">{docCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Asistan sohbeti */}
        <div className="lg:col-span-3 glass p-4 flex flex-col min-h-[420px] border border-indigo-500/20">
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium text-white">Asistan özeti</span>
            {hasDraft && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 ml-auto">
                Kaydedilmemiş değişiklik
              </span>
            )}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto max-h-[320px] pr-1">
            {assistantMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`rounded-lg p-3 text-sm ${
                  msg.role === 'warning'
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-100'
                    : msg.role === 'system'
                      ? 'bg-white/5 border border-white/10 text-slate-300'
                      : 'bg-indigo-500/10 border border-indigo-500/15 text-slate-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  {msg.role === 'warning' ? (
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  ) : msg.role === 'system' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Bot className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p>{msg.text}</p>
                    {msg.items?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {msg.items.map((item, i) => (
                          <li
                            key={i}
                            className="text-xs flex items-start gap-2 text-slate-400"
                          >
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] ${statusClass(item.status)}`}
                            >
                              {statusLabel(item.status)}
                            </span>
                            <span className="truncate">{item.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
            <div className="flex gap-2">
              <Select value={instructionTarget} onValueChange={setInstructionTarget}>
                <SelectTrigger className="h-9 w-[140px] text-xs bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notes">Öğretim notu</SelectItem>
                  <SelectItem value="system">Sistem talimatı</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={newInstruction}
                onChange={(e) => setNewInstruction(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addInstructionFromChat()}
                placeholder="Yeni talimat yazın…"
                className="flex-1 h-9 text-sm bg-white/5 border-white/10 text-white"
                data-testid="new-instruction-input"
              />
              <Button
                type="button"
                size="sm"
                className="h-9 bg-indigo-600"
                onClick={addInstructionFromChat}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-slate-500">
              Her satır ayrı talimat sayılır. Kaydetmeden derste kullanılmaz.
            </p>
          </div>
        </div>

        {/* İşlenen / sunucu durumu */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass p-4">
            <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Derste işlenen kaynaklar
            </h3>
            <ul className="space-y-2">
              {(serverBlocks.length ? serverBlocks : contextBlocks).map((block) => (
                <li
                  key={block.id}
                  className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-200">{block.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${statusClass(block.status)}`}
                    >
                      {block.applied === false && block.status === 'inactive'
                        ? 'Kapalı'
                        : block.status === 'warning'
                          ? 'Uyarı'
                          : serverStatus && !hasDraft
                            ? 'İşleniyor'
                            : statusLabel(block.status)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{block.detail}</p>
                </li>
              ))}
            </ul>
            {serverStatus?.updated_at && (
              <p className="text-[10px] text-slate-600 mt-3">
                Son kayıt: {new Date(serverStatus.updated_at).toLocaleString('tr-TR')}
              </p>
            )}
          </div>

          {instructionItems.length > 0 && (
            <div className="glass p-4 max-h-48 overflow-y-auto">
              <h3 className="text-sm font-medium text-white mb-2">Tüm talimat satırları</h3>
              <ul className="space-y-1.5">
                {instructionItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded border shrink-0 ${statusClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                    <span className="text-slate-400 truncate">
                      {item.source === 'system' ? 'Sistem' : 'Not'}: {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Düzenleme alanları */}
      <div className="glass p-6 space-y-6">
        <div className="flex items-center gap-4 border-b border-white/10 pb-4">
          <Label className="text-white font-medium text-base">Müfredat Kategorisi:</Label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-800 border border-white/10 text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <option value="Genel">Genel (Varsayılan)</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>{c.code} - {c.name_tr}</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-slate-300 mb-2 block">
            {selectedCategory === "Genel" ? "Sistem talimatları (satır satır işlenir)" : `${selectedCategory} için özel Sistem talimatları`}
          </Label>
          <textarea
            value={selectedCategory === "Genel" ? (config.system_prompt || '') : (config.category_overrides?.[selectedCategory]?.system_prompt || '')}
            onChange={(e) => {
              const val = e.target.value;
              if (selectedCategory === "Genel") {
                setConfig((c) => ({ ...c, system_prompt: val }));
              } else {
                setConfig((c) => ({
                  ...c,
                  category_overrides: {
                    ...(c.category_overrides || {}),
                    [selectedCategory]: {
                      ...((c.category_overrides || {})[selectedCategory] || {}),
                      system_prompt: val,
                    }
                  }
                }));
              }
            }}
            className="w-full h-28 p-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            placeholder="Örn: Öğrencilere her zaman Türkçe açıklama yap."
            data-testid="system-prompt-input"
          />
        </div>
        <div>
          <Label className="text-slate-300 mb-2 block">
            {selectedCategory === "Genel" ? "Öğretim notları" : `${selectedCategory} için Öğretim notları`}
          </Label>
          <textarea
            value={selectedCategory === "Genel" ? (config.custom_instructions || '') : (config.category_overrides?.[selectedCategory]?.custom_instructions || '')}
            onChange={(e) => {
              const val = e.target.value;
              if (selectedCategory === "Genel") {
                setConfig((c) => ({ ...c, custom_instructions: val }));
              } else {
                setConfig((c) => ({
                  ...c,
                  category_overrides: {
                    ...(c.category_overrides || {}),
                    [selectedCategory]: {
                      ...((c.category_overrides || {})[selectedCategory] || {}),
                      custom_instructions: val,
                    }
                  }
                }));
              }
            }}
            className="w-full h-28 p-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            placeholder="Örn: Gramer hatalarında detaylı açıklama yap."
            data-testid="custom-instructions-input"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
            <div>
              <p className="text-sm text-white">Cümle bankasını kullan</p>
              <p className="text-xs text-slate-500">Kayıtlı cümleler derse eklenir</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setConfig((c) => ({ ...c, use_sentence_bank: !c.use_sentence_bank }))
              }
              className={`w-12 h-6 rounded-full transition-colors ${config.use_sentence_bank ? 'bg-indigo-600' : 'bg-slate-600'}`}
              data-testid="toggle-sentence-bank"
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${config.use_sentence_bank ? 'translate-x-6' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
            <div>
              <p className="text-sm text-white">Dokümanları kullan</p>
              <p className="text-xs text-slate-500">Yüklenen dokümanlar bağlama eklenir</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setConfig((c) => ({ ...c, use_documents: !c.use_documents }))
              }
              className={`w-12 h-6 rounded-full transition-colors ${config.use_documents ? 'bg-indigo-600' : 'bg-slate-600'}`}
              data-testid="toggle-documents"
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${config.use_documents ? 'translate-x-6' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
        </div>

        <div>
          <Label className="text-slate-300 mb-2 block">
            Ders başına maksimum cümle: {config.max_sentences_per_lesson}
          </Label>
          <Slider
            value={[config.max_sentences_per_lesson]}
            onValueChange={([v]) => setConfig((c) => ({ ...c, max_sentences_per_lesson: v }))}
            min={1}
            max={30}
            step={1}
            data-testid="max-sentences-slider"
          />
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN ADMIN DASHBOARD ====================
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modules, setModules] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [newModuleInputs, setNewModuleInputs] = useState({});
  const [newTopicInputs, setNewTopicInputs] = useState({});
  const [customLessonForms, setCustomLessonForms] = useState({});
  const [customLessonSaving, setCustomLessonSaving] = useState({});
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ code: '', name_tr: '', name_en: '' });
  const [showAddModuleModal, setShowAddModuleModal] = useState(false);
  const [moduleForm, setModuleForm] = useState({ category_code: 'A1', name_tr: '', name_en: '' });
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddLevel, setQuickAddLevel] = useState('A1');
  const [quickAddModuleId, setQuickAddModuleId] = useState('');
  const [quickAddForm, setQuickAddForm] = useState({ title: '', title_tr: '' });
  
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [addUserForm, setAddUserForm] = useState({ name: '', email: '', password: '', level: 'A1', is_admin: false, daily_limit_minutes: 30 });
  const [quotaUser, setQuotaUser] = useState(null);
  const [quotaForm, setQuotaForm] = useState({ daily_limit_minutes: 30, used_minutes_today: 0 });
  const [quotaSaving, setQuotaSaving] = useState(false);
  const [elevenLabsKeyInput, setElevenLabsKeyInput] = useState('');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState('21m00Tcm4TlvDq8ikWAM');
  const [useElevenLabs, setUseElevenLabs] = useState(false);

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!settings) return;
    setElevenLabsVoiceId(settings.elevenlabs_voice_id || '21m00Tcm4TlvDq8ikWAM');
    setUseElevenLabs(!!settings.use_elevenlabs);
    setElevenLabsKeyInput('');
  }, [settings?.elevenlabs_voice_id, settings?.use_elevenlabs, settings?.elevenlabs_api_key]);

  const fetchData = async () => {
    try {
      const [statsData, scenariosData, categoriesData, modulesData, usersData, settingsData] =
        await Promise.all([
          adminApi.getAdminStats(),
          adminApi.getScenariosAdmin(),
          curriculumApi.getCurriculumCategories(),
          curriculumApi.getCurriculumModules(),
          adminApi.getAdminUsers(),
          adminApi.getAdminSettings(),
        ]);
      setStats(statsData);
      setScenarios(scenariosData);
      setCategories(categoriesData);
      setModules(modulesData);
      if (categoriesData[0]?.code) {
        setQuickAddLevel(categoriesData[0].code);
        const firstMod = modulesData.find((m) => m.category_code === categoriesData[0].code);
        if (firstMod) setQuickAddModuleId(firstMod.id);
      }
      setUsers(usersData);
      setSettings(settingsData);
    } catch { toast.error('Veri yuklenemedi'); }
  };

  const addQuickTopic = async (moduleId, categoryCode) => {
    const input = newTopicInputs[moduleId]?.trim();
    if (!input || !moduleId) return;
    try {
      await adminApi.createScenario({
        level: categoryCode,
        module_id: moduleId,
        title: input,
        title_tr: input,
        description: `Practice ${input} conversations`,
        description_tr: `${input} konusma pratigi`,
        topics: [],
      });
      toast.success('Konu eklendi');
      setNewTopicInputs((prev) => ({ ...prev, [moduleId]: '' }));
      fetchData();
    } catch {
      toast.error('Konu eklenemedi');
    }
  };

  const getCustomLessonForm = (categoryCode, catModules = []) => {
    const base = defaultCustomLessonForm();
    const saved = customLessonForms[categoryCode];
    const merged = { ...base, ...saved };
    if (!merged.moduleId && catModules[0]?.id) {
      merged.moduleId = catModules[0].id;
    }
    return merged;
  };

  const patchCustomLessonForm = (categoryCode, patch, catModules = []) => {
    setCustomLessonForms((prev) => {
      const base = defaultCustomLessonForm();
      const merged = { ...base, ...prev[categoryCode], ...patch };
      if (!merged.moduleId && catModules[0]?.id) {
        merged.moduleId = catModules[0].id;
      }
      return { ...prev, [categoryCode]: merged };
    });
  };

  const createCustomWordLesson = async (categoryCode, catModules) => {
    const form = getCustomLessonForm(categoryCode, catModules);
    const moduleId = form.moduleId || catModules[0]?.id;
    const title = form.title?.trim();
    const words = form.words.map((w) => w.trim()).filter(Boolean);
    if (!moduleId) {
      toast.error('Önce bir alt kutu ekleyin veya seçin');
      return;
    }
    if (!title) {
      toast.error('Ders adı girin');
      return;
    }
    if (words.length < 2) {
      toast.error('En az 2 kelime girin');
      return;
    }
    setCustomLessonSaving((prev) => ({ ...prev, [categoryCode]: true }));
    try {
      const note = form.teacherNote?.trim() || '';
      await adminApi.createScenario({
        level: categoryCode,
        module_id: moduleId,
        title,
        title_tr: title,
        description: `Word build: ${words.join(', ')}`,
        description_tr: note || `${words.join(', ')} kelimeleriyle İngilizce cümle kurma`,
        topics: buildWordBuildTopics(words, note),
      });
      toast.success('Özel ders oluşturuldu');
      patchCustomLessonForm(
        categoryCode,
        { title: '', words: ['', '', ''], teacherNote: '' },
        catModules
      );
      fetchData();
    } catch (err) {
      toast.error(err?.message || 'Ders oluşturulamadı');
    } finally {
      setCustomLessonSaving((prev) => ({ ...prev, [categoryCode]: false }));
    }
  };

  const addModuleToCategory = async (categoryCode) => {
    const name = newModuleInputs[categoryCode]?.trim();
    if (!name) return;
    try {
      await curriculumApi.createCurriculumModule({
        category_code: categoryCode,
        name_tr: name,
        sort_order: modules.filter((m) => m.category_code === categoryCode).length + 1,
      });
      toast.success('Alt kutu eklendi');
      setNewModuleInputs((prev) => ({ ...prev, [categoryCode]: '' }));
      fetchData();
    } catch (err) {
      toast.error(err?.message || 'Alt kutu eklenemedi');
    }
  };

  const handleAddModule = async (e) => {
    e.preventDefault();
    try {
      await curriculumApi.createCurriculumModule({
        category_code: moduleForm.category_code,
        name_tr: moduleForm.name_tr,
        name_en: moduleForm.name_en,
        sort_order: modules.filter((m) => m.category_code === moduleForm.category_code).length + 1,
      });
      toast.success('Alt kutu eklendi');
      setShowAddModuleModal(false);
      setModuleForm({ category_code: quickAddLevel, name_tr: '', name_en: '' });
      fetchData();
    } catch (err) {
      toast.error(err?.message || 'Alt kutu eklenemedi');
    }
  };

  const handleDeleteModule = async (mod) => {
    if (!window.confirm(`${mod.label} alt kutusunu silmek istiyor musunuz?`)) return;
    try {
      await curriculumApi.deleteCurriculumModule(mod.id);
      toast.success('Alt kutu silindi');
      fetchData();
    } catch (err) {
      toast.error(err?.message || 'Silinemedi');
    }
  };

  const deleteScenario = async (id) => {
    if (!window.confirm('Bu konuyu silmek istediginize emin misiniz?')) return;
    try {
      await adminApi.deleteScenario(id);
      toast.success('Konu silindi');
      fetchData();
    } catch { toast.error('Konu silinemedi'); }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    try {
      await curriculumApi.createCurriculumCategory({
        code: categoryForm.code,
        name_tr: categoryForm.name_tr,
        name_en: categoryForm.name_en,
        sort_order: categories.length + 1,
      });
      toast.success('Ana kategori eklendi');
      setShowAddCategoryModal(false);
      setCategoryForm({ code: '', name_tr: '', name_en: '' });
      fetchData();
    } catch (err) {
      toast.error(err?.message || 'Kategori eklenemedi');
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (!window.confirm(`${cat.code} kategorisini silmek istiyor musunuz?`)) return;
    try {
      await curriculumApi.deleteCurriculumCategory(cat.id, cat.code);
      toast.success('Kategori silindi');
      fetchData();
    } catch (err) {
      toast.error(err?.message || 'Kategori silinemedi');
    }
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickAddForm.title_tr.trim()) return;
    try {
      if (!quickAddModuleId) {
        toast.error('Once alt kutu secin veya ekleyin');
        return;
      }
      await adminApi.createScenario({
        level: quickAddLevel,
        module_id: quickAddModuleId,
        title: quickAddForm.title || quickAddForm.title_tr,
        title_tr: quickAddForm.title_tr,
        description: `Practice ${quickAddForm.title || quickAddForm.title_tr} conversations`,
        description_tr: `${quickAddForm.title_tr} konusma pratigi`,
        topics: [],
      });
      toast.success('Konu eklendi');
      setShowQuickAddModal(false);
      setQuickAddForm({ title: '', title_tr: '' });
      fetchData();
    } catch { toast.error('Konu eklenemedi'); }
  };

  const updateSettings = async (newSettings) => {
    try {
      await adminApi.updateAdminSettings(newSettings);
      setSettings(prev => ({ ...prev, ...newSettings }));
      toast.success('Ayarlar guncellendi');
    } catch (err) {
      toast.error(err?.message || 'Ayarlar guncellenemedi');
    }
  };

  const saveElevenLabsSettings = async (e) => {
    e?.preventDefault?.();
    const updates = {
      use_elevenlabs: useElevenLabs,
      elevenlabs_voice_id: elevenLabsVoiceId.trim() || '21m00Tcm4TlvDq8ikWAM',
    };
    if (elevenLabsKeyInput.trim()) {
      updates.elevenlabs_api_key = elevenLabsKeyInput.trim();
    }
    if (useElevenLabs && !settings?.elevenlabs_api_key && !elevenLabsKeyInput.trim()) {
      toast.error('ElevenLabs acikken API anahtari gerekli');
      return;
    }
    await updateSettings(updates);
    setElevenLabsKeyInput('');
  };

  const clearElevenLabsKey = async () => {
    if (!window.confirm('ElevenLabs anahtarini silmek istediginize emin misiniz?')) return;
    await updateSettings({ elevenlabs_api_key: '', use_elevenlabs: false });
    setUseElevenLabs(false);
    setElevenLabsKeyInput('');
  };

  const openQuotaModal = (u) => {
    setQuotaUser(u);
    setQuotaForm({
      daily_limit_minutes: u.daily_limit_minutes ?? 30,
      used_minutes_today: Math.round(u.used_minutes_today || 0),
    });
  };

  const handleSaveQuota = async (e) => {
    e?.preventDefault?.();
    if (!quotaUser) return;
    setQuotaSaving(true);
    try {
      const updated = await adminApi.updateAdminUserProfile(quotaUser.id, {
        daily_limit_minutes: quotaForm.daily_limit_minutes,
        used_minutes_today: quotaForm.used_minutes_today,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`${quotaUser.name} kotasi guncellendi`);
      setQuotaUser(null);
    } catch (err) {
      toast.error(err?.message || 'Kota guncellenemedi');
    } finally {
      setQuotaSaving(false);
    }
  };

  const quickQuotaBoost = async (u, extraMinutes) => {
    try {
      const newLimit = (u.daily_limit_minutes ?? 30) + extraMinutes;
      const updated = await adminApi.updateAdminUserProfile(u.id, {
        daily_limit_minutes: newLimit,
      });
      setUsers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      toast.success(`${u.name}: gunluk limit ${newLimit} dk`);
    } catch (err) {
      toast.error(err?.message || 'Kota artirilamadi');
    }
  };

  const resetUserUsageToday = async (u) => {
    try {
      const updated = await adminApi.updateAdminUserProfile(u.id, { used_minutes_today: 0 });
      setUsers((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      toast.success(`${u.name}: bugunku kullanim sifirlandi`);
    } catch (err) {
      toast.error(err?.message || 'Kullanim sifirlanamadi');
    }
  };

  const openAddUserModal = () => {
    setEditingUser(null);
    setAddUserForm({ name: '', email: '', password: '', level: 'A1', is_admin: false, daily_limit_minutes: 30 });
    setShowAddUserModal(true);
  };

  const openEditUserModal = (u) => {
    setEditingUser(u);
    setAddUserForm({ 
      name: u.name || '', 
      email: u.email || '', 
      password: '', // Password update not supported here
      level: u.level || 'A1', 
      is_admin: !!u.is_admin, 
      daily_limit_minutes: u.daily_limit_minutes || 30 
    });
    setShowAddUserModal(true);
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await adminApi.updateAdminUserProfile(editingUser.id, {
          name: addUserForm.name,
          level: addUserForm.level,
          daily_limit_minutes: addUserForm.daily_limit_minutes,
          is_admin: addUserForm.is_admin,
        });
        if (addUserForm.password) {
          await adminApi.updateAdminUserPassword(editingUser.id, addUserForm.password);
        }
        toast.success('Kullanici guncellendi');
      } else {
        await adminApi.createAdminUser(addUserForm);
        toast.success('Kullanici basariyla eklendi');
      }
      setShowAddUserModal(false);
      setEditingUser(null);
      setAddUserForm({ name: '', email: '', password: '', level: 'A1', is_admin: false, daily_limit_minutes: 30 });
      fetchData(); // refresh user list
    } catch (err) { 
      toast.error(err?.message || err.response?.data?.detail || 'Islem basarisiz'); 
    }
  };

  const toneLabels = { friendly: 'Arkadasca', formal: 'Resmi', encouraging: 'Tesvik Edici' };
  const speedLabels = { slow: 'Yavas', normal: 'Normal', fast: 'Hizli' };

  const modulesForCategory = (code) => modules.filter((m) => m.category_code === code);
  const scenariosForModule = (moduleId) => scenarios.filter((s) => s.module_id === moduleId);
  const quickAddModules = modules.filter((m) => m.category_code === quickAddLevel);

  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="page-background">
        <img src="https://images.unsplash.com/photo-1760224254117-7a40f7f03fe2?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwyfHxwcmVtaXVtJTIwYWJzdHJhY3QlMjBkYXJrJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3NzU0NTY2MjJ8MA&ixlib=rb-4.1.0&q=85" alt="Background" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button onClick={() => navigate('/')}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors" data-testid="back-btn">
              <ArrowLeft className="w-5 h-5" /><span>Ana Sayfaya Don</span>
            </button>
            <h1 className="text-xl font-heading font-semibold text-white">Yonetim Paneli</h1>
            <div className="w-24" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Users, label: 'Toplam Kullanici', value: stats?.total_users || 0, color: 'indigo' },
            { icon: BookOpen, label: 'Toplam Konu', value: stats?.total_scenarios || 0, color: 'emerald' },
            { icon: Clock, label: 'Toplam Oturum', value: stats?.total_sessions || 0, color: 'purple' },
            { icon: Activity, label: 'Bugunku Oturum', value: stats?.today_sessions || 0, color: 'amber' }
          ].map((stat, index) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }} className="glass p-4">
              <stat.icon className={`w-5 h-5 text-${stat.color}-400 mb-2`} />
              <p className="text-2xl font-heading font-semibold text-white">{stat.value}</p>
              <p className="text-xs text-slate-400">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="curriculum" className="space-y-6">
          <TabsList className="glass p-1 flex-wrap">
            <TabsTrigger value="curriculum" data-testid="curriculum-tab">
              <GraduationCap className="w-4 h-4 mr-2" />Mufredat
            </TabsTrigger>
            <TabsTrigger value="sentences" data-testid="sentences-tab">
              <FileText className="w-4 h-4 mr-2" />Cumle Bankasi
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="documents-tab">
              <Upload className="w-4 h-4 mr-2" />Dokumanlar
            </TabsTrigger>
            <TabsTrigger value="ai-config" data-testid="ai-config-tab">
              <Brain className="w-4 h-4 mr-2" />AI Egitimi
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="users-tab">Kullanicilar</TabsTrigger>
            <TabsTrigger value="settings" data-testid="settings-tab">Ayarlar</TabsTrigger>
          </TabsList>

          {/* Curriculum Tab */}
          <TabsContent value="curriculum">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-heading font-medium text-white">Mufredat Yapisi</h2>
                  <p className="text-sm text-slate-400">
                    Ana kategori (A1) → alt kutular (Başlangıç, Gelişmiş) → konular
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowAddCategoryModal(true)}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                    data-testid="add-category-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Yeni Ana Kategori
                  </Button>
                  <Button
                    onClick={() => setShowQuickAddModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-500"
                    data-testid="add-topic-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Konu Ekle
                  </Button>
                </div>
              </div>

              <div className="space-y-8">
                {categories.map((cat, catIndex) => {
                  const colors = categoryColors(cat.code, catIndex);
                  const catModules = modulesForCategory(cat.code);
                  const totalTopics = catModules.reduce(
                    (n, m) => n + scenariosForModule(m.id).length,
                    0
                  );
                  return (
                    <section
                      key={cat.id || cat.code}
                      className={`glass border-t-4 ${colors.border} rounded-xl overflow-hidden`}
                    >
                      <div className={`p-4 ${colors.bg} border-b border-white/10 flex flex-wrap items-center justify-between gap-3`}>
                        <div>
                          <span className={`text-xl font-bold ${colors.text}`}>{cat.code}</span>
                          <span className="text-sm text-slate-400 ml-2">
                            {cat.name_tr}
                            {cat.name_en && cat.name_en !== cat.name_tr ? ` · ${cat.name_en}` : ''}
                          </span>
                          <p className="text-xs text-slate-500 mt-1">
                            {catModules.length} alt kutu · {totalTopics} konu
                          </p>
                        </div>
                        <div className="flex gap-2 items-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/20 text-white h-8"
                            onClick={() => {
                              setModuleForm({ category_code: cat.code, name_tr: '', name_en: '' });
                              setShowAddModuleModal(true);
                            }}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Alt Kutu
                          </Button>
                          {cat.id && catModules.length === 0 && totalTopics === 0 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat)}
                              className="p-2 text-slate-500 hover:text-red-400"
                              title="Ana kategoriyi sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {catModules.length === 0 ? (
                        <div className="p-6">
                          <p className="text-sm text-slate-500 text-center mb-4">
                            {cat.code} icin henuz alt kutu yok. Ornek: Başlangıç, Gelişmiş
                          </p>
                          <div className="flex gap-2 max-w-md mx-auto">
                            <Input
                              value={newModuleInputs[cat.code] || ''}
                              onChange={(e) =>
                                setNewModuleInputs((prev) => ({
                                  ...prev,
                                  [cat.code]: e.target.value,
                                }))
                              }
                              placeholder="Orn: Başlangıç"
                              className="bg-white/5 border-white/10 text-white text-sm"
                              onKeyDown={(e) => e.key === 'Enter' && addModuleToCategory(cat.code)}
                            />
                            <Button onClick={() => addModuleToCategory(cat.code)} size="sm">
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {catModules.map((mod) => {
                            const modScenarios = scenariosForModule(mod.id);
                            return (
                              <div
                                key={mod.id}
                                className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col"
                              >
                                <div className="p-3 border-b border-white/10 flex items-start justify-between gap-2">
                                  <div>
                                    <p className={`text-sm font-semibold ${colors.text}`}>
                                      {moduleDisplayName(mod, cat.code)}
                                    </p>
                                    <p className="text-xs text-slate-500">{modScenarios.length} konu</p>
                                  </div>
                                  {modScenarios.length === 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteModule(mod)}
                                      className="p-1 text-slate-500 hover:text-red-400"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                                <div className="p-2 flex-1 max-h-40 overflow-y-auto min-h-[4rem]">
                                  {modScenarios.length === 0 ? (
                                    <p className="text-xs text-slate-600 text-center py-2">Konu yok</p>
                                  ) : (
                                    modScenarios.map((scenario) => (
                                      <div
                                        key={scenario.id}
                                        className="flex items-center justify-between p-2 rounded hover:bg-white/5 group"
                                      >
                                        <span className="text-xs text-slate-300">
                                          {scenario.title_tr}
                                          {isWordBuildLesson(scenario.topics) && (
                                            <span className="ml-1.5 text-[10px] text-indigo-400">
                                              · kelime dersi
                                            </span>
                                          )}
                                        </span>
                                        <button
                                          onClick={() => deleteScenario(scenario.id)}
                                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div className="p-2 border-t border-white/10 flex gap-2">
                                  <Input
                                    value={newTopicInputs[mod.id] || ''}
                                    onChange={(e) =>
                                      setNewTopicInputs((prev) => ({
                                        ...prev,
                                        [mod.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Yeni konu..."
                                    className="h-8 text-xs bg-white/5 border-white/10 text-white"
                                    onKeyDown={(e) =>
                                      e.key === 'Enter' && addQuickTopic(mod.id, cat.code)
                                    }
                                  />
                                  <Button
                                    size="sm"
                                    className="h-8 px-2 bg-white/10"
                                    onClick={() => addQuickTopic(mod.id, cat.code)}
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                          <div className="rounded-lg border border-dashed border-white/15 p-3 flex flex-col justify-center min-h-[120px]">
                            <p className="text-xs text-slate-500 mb-2 text-center">Hızlı alt kutu</p>
                            <div className="flex gap-2">
                              <Input
                                value={newModuleInputs[cat.code] || ''}
                                onChange={(e) =>
                                  setNewModuleInputs((prev) => ({
                                    ...prev,
                                    [cat.code]: e.target.value,
                                  }))
                                }
                                placeholder="Gelişmiş..."
                                className="h-8 text-xs bg-white/5 border-white/10 text-white"
                                onKeyDown={(e) => e.key === 'Enter' && addModuleToCategory(cat.code)}
                              />
                              <Button
                                size="sm"
                                className="h-8 px-2"
                                onClick={() => addModuleToCategory(cat.code)}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="rounded-lg border border-dashed border-indigo-500/35 bg-indigo-500/5 p-4 flex flex-col gap-3 lg:col-span-2 xl:col-span-1 min-h-[200px]">
                            <div>
                              <p className="text-sm font-medium text-indigo-300">Özel ders oluştur</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                Kelime verin — öğrenci bu kelimelerle İngilizce cümle kursun
                              </p>
                            </div>
                            {catModules.length === 0 ? (
                              <p className="text-xs text-slate-500 text-center py-4">
                                Önce yukarıdan bir alt kutu ekleyin
                              </p>
                            ) : (
                              <>
                                <div>
                                  <Label className="text-xs text-slate-400">Alt kutu</Label>
                                  <Select
                                    value={getCustomLessonForm(cat.code, catModules).moduleId}
                                    onValueChange={(v) =>
                                      patchCustomLessonForm(cat.code, { moduleId: v }, catModules)
                                    }
                                  >
                                    <SelectTrigger className="h-8 mt-1 text-xs bg-white/5 border-white/10 text-white">
                                      <SelectValue placeholder="Kutu seçin" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {catModules.map((mod) => (
                                        <SelectItem key={mod.id} value={mod.id}>
                                          {moduleDisplayName(mod, cat.code)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-400">Ders adı</Label>
                                  <Input
                                    value={getCustomLessonForm(cat.code, catModules).title}
                                    onChange={(e) =>
                                      patchCustomLessonForm(
                                        cat.code,
                                        { title: e.target.value },
                                        catModules
                                      )
                                    }
                                    placeholder="Örn: Sabah rutini kelimeleri"
                                    className="h-8 mt-1 text-xs bg-white/5 border-white/10 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-400">
                                    Kelimeler (en az 2)
                                  </Label>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {getCustomLessonForm(cat.code, catModules).words.map(
                                      (word, idx) => (
                                        <Input
                                          key={idx}
                                          value={word}
                                          onChange={(e) => {
                                            const next = [
                                              ...getCustomLessonForm(cat.code, catModules).words,
                                            ];
                                            next[idx] = e.target.value;
                                            patchCustomLessonForm(
                                              cat.code,
                                              { words: next },
                                              catModules
                                            );
                                          }}
                                          placeholder={`Kelime ${idx + 1}`}
                                          className="h-8 text-xs bg-white/5 border-white/10 text-white flex-1 min-w-[88px]"
                                        />
                                      )
                                    )}
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-2 border-white/20"
                                      onClick={() =>
                                        patchCustomLessonForm(
                                          cat.code,
                                          {
                                            words: [
                                              ...getCustomLessonForm(cat.code, catModules).words,
                                              '',
                                            ],
                                          },
                                          catModules
                                        )
                                      }
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                  <Input
                                    className="h-8 mt-2 text-xs bg-white/5 border-white/10 text-white"
                                    placeholder="veya: morning, coffee, happy"
                                    onBlur={(e) => {
                                      const parsed = parseWordsFromText(e.target.value);
                                      if (!parsed.length) return;
                                      patchCustomLessonForm(
                                        cat.code,
                                        { words: parsed },
                                        catModules
                                      );
                                      e.target.value = '';
                                    }}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-400">
                                    Öğretmen notu (isteğe bağlı)
                                  </Label>
                                  <Textarea
                                    value={getCustomLessonForm(cat.code, catModules).teacherNote}
                                    onChange={(e) =>
                                      patchCustomLessonForm(
                                        cat.code,
                                        { teacherNote: e.target.value },
                                        catModules
                                      )
                                    }
                                    placeholder="Örn: Her cümlede en az bir kelime kullanılsın"
                                    className="mt-1 text-xs bg-white/5 border-white/10 text-white min-h-[56px]"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="bg-indigo-600 hover:bg-indigo-500 w-full"
                                  disabled={customLessonSaving[cat.code]}
                                  onClick={() => createCustomWordLesson(cat.code, catModules)}
                                  data-testid={`custom-lesson-${cat.code}`}
                                >
                                  {customLessonSaving[cat.code] ? 'Kaydediliyor...' : 'Dersi oluştur'}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* Sentence Bank Tab */}
          <TabsContent value="sentences">
            <SentenceBankTab />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <DocumentsTab userId={user?.id} />
          </TabsContent>

          {/* AI Config Tab */}
          <TabsContent value="ai-config">
            <AIConfigTab categories={categories} />
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="glass p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-heading font-medium text-white">Kullanicilar</h2>
                <Button onClick={openAddUserModal} className="bg-indigo-600 hover:bg-indigo-500" data-testid="add-user-btn">
                  <Plus className="w-4 h-4 mr-2" />Kullanici Ekle
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-sm font-medium text-slate-400 pb-3">Ad</th>
                      <th className="text-left text-sm font-medium text-slate-400 pb-3">E-posta</th>
                      <th className="text-left text-sm font-medium text-slate-400 pb-3">Seviye</th>
                      <th className="text-left text-sm font-medium text-slate-400 pb-3">Bugunku Kullanim</th>
                      <th className="text-left text-sm font-medium text-slate-400 pb-3">Rol</th>
                      <th className="text-right text-sm font-medium text-slate-400 pb-3">Islemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const used = Math.round(u.used_minutes_today || 0);
                      const limit = u.daily_limit_minutes ?? 30;
                      const quotaFull = !u.is_admin && used >= limit;
                      return (
                      <tr key={u.id} className={`border-b border-white/5 ${quotaFull ? 'bg-amber-500/5' : ''}`}>
                        <td className="py-3 text-white">{u.name}</td>
                        <td className="py-3 text-slate-300">{u.email}</td>
                        <td className="py-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${LEVEL_COLORS[u.level]?.bg} ${LEVEL_COLORS[u.level]?.text}`}>
                            {u.level}
                          </span>
                        </td>
                        <td className={`py-3 ${quotaFull ? 'text-amber-400 font-medium' : 'text-slate-300'}`}>
                          {used} / {limit} dk
                          {quotaFull && <span className="ml-2 text-[10px] uppercase text-amber-500">Dolu</span>}
                        </td>
                        <td className="py-3">
                          {u.is_admin ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Yonetici</span>
                          ) : (
                            <span className="text-xs text-slate-500">Ogrenci</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {!u.is_admin && quotaFull && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                                onClick={() => quickQuotaBoost(u, 30)}
                                data-testid={`quota-boost-${u.id}`}
                              >
                                +30 dk
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-indigo-400 hover:text-indigo-300"
                              onClick={() => openQuotaModal(u)}
                              data-testid={`quota-edit-${u.id}`}
                            >
                              <Clock className="w-3.5 h-3.5 mr-1" />
                              Kota
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 text-blue-400 hover:text-blue-300"
                              onClick={() => openEditUserModal(u)}
                              data-testid={`user-edit-${u.id}`}
                            >
                              <Settings className="w-3.5 h-3.5 mr-1" />
                              Duzenle
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="glass p-6 max-w-2xl">
              <h2 className="text-xl font-heading font-medium text-white mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5" />Genel Ayarlar
              </h2>
              {settings && (
                <div className="space-y-8">
                  <div>
                    <Label className="text-slate-300 mb-2 block">
                      Gunluk Pratik Limiti (dakika): {settings.daily_limit_minutes}
                    </Label>
                    <Slider value={[settings.daily_limit_minutes]}
                      onValueChange={([value]) => updateSettings({ daily_limit_minutes: value })}
                      min={5} max={120} step={5} className="mt-2" data-testid="daily-limit-slider" />
                    <p className="text-xs text-slate-500 mt-2">Yeni kullanicilar bu limitle baslayacak</p>
                  </div>
                  <div>
                    <Label className="text-slate-300 mb-2 block">Ogretmen Tonu</Label>
                    <Select value={settings.teacher_tone} onValueChange={(value) => updateSettings({ teacher_tone: value })}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="teacher-tone-select">
                        <SelectValue>{toneLabels[settings.teacher_tone] || settings.teacher_tone}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Arkadasca</SelectItem>
                        <SelectItem value="formal">Resmi</SelectItem>
                        <SelectItem value="encouraging">Tesvik Edici</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-2">Speaky'nin ogrencilerle iletisim tarzi</p>
                  </div>
                  <div>
                    <Label className="text-slate-300 mb-2 block">Konusma Hizi</Label>
                    <Select value={settings.speech_speed} onValueChange={(value) => updateSettings({ speech_speed: value })}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="speech-speed-select">
                        <SelectValue>{speedLabels[settings.speech_speed] || settings.speech_speed}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slow">Yavas</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="fast">Hizli</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-2">Speaky'nin sesli yanitlarinin hizi</p>
                  </div>

                  <div className="border-t border-white/10 pt-6 space-y-4">
                    <h3 className="text-lg font-medium text-white">ElevenLabs (premium ses)</h3>
                    <p className="text-xs text-slate-500">
                      Acikken ogrencilerin Ingilizce cumleleri ElevenLabs ile okunur; Turkce talimatlar Edge TTS ile devam eder.
                      Kapaliyken veya anahtar yokken tamamen ucretsiz Edge TTS kullanilir.
                    </p>
                    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                      <div>
                        <Label className="text-slate-200">ElevenLabs kullan</Label>
                        <p className="text-xs text-slate-500 mt-1">
                          {useElevenLabs && settings.elevenlabs_api_key
                            ? 'Aktif — ogrenciler Ingilizce icin ElevenLabs duyar'
                            : 'Kapali — standart Edge TTS'}
                        </p>
                      </div>
                      <Switch
                        checked={useElevenLabs}
                        onCheckedChange={setUseElevenLabs}
                        data-testid="use-elevenlabs-switch"
                      />
                    </div>
                    <form className="space-y-4" onSubmit={saveElevenLabsSettings} autoComplete="off">
                      <input
                        type="text"
                        name="username"
                        autoComplete="username"
                        tabIndex={-1}
                        aria-hidden="true"
                        className="sr-only"
                        defaultValue="admin"
                        readOnly
                      />
                      <div>
                        <Label htmlFor="elevenlabs-api-key" className="text-slate-300 mb-2 block">
                          ElevenLabs API anahtari
                        </Label>
                        <Input
                          id="elevenlabs-api-key"
                          type="password"
                          autoComplete="new-password"
                          value={elevenLabsKeyInput}
                          onChange={(e) => setElevenLabsKeyInput(e.target.value)}
                          placeholder={
                            settings.elevenlabs_api_key
                              ? 'Kayitli anahtar var — degistirmek icin yazin'
                              : 'xi-api-key veya sk_...'
                          }
                          className="bg-white/5 border-white/10 text-white"
                          data-testid="elevenlabs-api-key"
                        />
                      </div>
                      <div>
                        <Label htmlFor="elevenlabs-voice-id" className="text-slate-300 mb-2 block">
                          Voice ID (Ingilizce ses)
                        </Label>
                        <Input
                          id="elevenlabs-voice-id"
                          value={elevenLabsVoiceId}
                          onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                          placeholder="21m00Tcm4TlvDq8ikWAM"
                          className="bg-white/5 border-white/10 text-white"
                          data-testid="elevenlabs-voice-id"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" data-testid="elevenlabs-save">
                          <Save className="w-4 h-4 mr-2" />
                          Kaydet
                        </Button>
                        {settings.elevenlabs_api_key && (
                          <Button type="button" variant="outline" onClick={clearElevenLabsKey}>
                            Anahtari sil
                          </Button>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Yeni Ana Kategori */}
      <Dialog open={showAddCategoryModal} onOpenChange={setShowAddCategoryModal}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">Yeni Ana Kategori</DialogTitle>
            <DialogDescription className="text-slate-400">
              Ornek: A1, B2 veya ozel kod (IS_ING). Altina konulari karttan ekleyeceksiniz.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCategory} className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">Kategori kodu</Label>
              <Input
                value={categoryForm.code}
                onChange={(e) =>
                  setCategoryForm((prev) => ({
                    ...prev,
                    code: normalizeCategoryCode(e.target.value),
                  }))
                }
                className="bg-white/5 border-white/10 text-white mt-1 uppercase"
                placeholder="A1, B2, IS_ING"
                required
              />
            </div>
            <div>
              <Label className="text-slate-300">Ad (Turkce)</Label>
              <Input
                value={categoryForm.name_tr}
                onChange={(e) => setCategoryForm((prev) => ({ ...prev, name_tr: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1"
                placeholder="Baslangic, Is Ingilizcesi"
                required
              />
            </div>
            <div>
              <Label className="text-slate-300">Ad (Ingilizce - opsiyonel)</Label>
              <Input
                value={categoryForm.name_en}
                onChange={(e) => setCategoryForm((prev) => ({ ...prev, name_en: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1"
                placeholder="Beginner"
              />
            </div>
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500">
              Kategori Olustur
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alt Kutu Modal */}
      <Dialog open={showAddModuleModal} onOpenChange={setShowAddModuleModal}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">Yeni Alt Kutu</DialogTitle>
            <DialogDescription className="text-slate-400">
              Ornek: Başlangıç → ekranda A1 Başlangıç olarak gorunur
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddModule} className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">Ana kategori</Label>
              <Select
                value={moduleForm.category_code}
                onValueChange={(v) => setModuleForm((prev) => ({ ...prev, category_code: v }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.code} value={cat.code}>
                      {cat.code} — {cat.name_tr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Alt kutu adi (Turkce)</Label>
              <Input
                value={moduleForm.name_tr}
                onChange={(e) => setModuleForm((prev) => ({ ...prev, name_tr: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1"
                placeholder="Başlangıç, Gelişmiş, Genel"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500">
              Alt Kutu Olustur
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Add Modal */}
      <Dialog open={showQuickAddModal} onOpenChange={setShowQuickAddModal}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">Yeni Konu Ekle</DialogTitle>
            <DialogDescription className="text-slate-400">
              Ana kategori ve alt kutu secin, sonra konu adini girin
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleQuickAdd} className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">Ana kategori</Label>
              <Select
                value={quickAddLevel}
                onValueChange={(v) => {
                  setQuickAddLevel(v);
                  const first = modules.find((m) => m.category_code === v);
                  setQuickAddModuleId(first?.id || '');
                }}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.code} value={cat.code}>
                      {cat.code} — {cat.name_tr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Alt kutu</Label>
              <Select value={quickAddModuleId} onValueChange={setQuickAddModuleId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                  <SelectValue placeholder="Alt kutu secin" />
                </SelectTrigger>
                <SelectContent>
                  {quickAddModules.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      Once alt kutu ekleyin
                    </SelectItem>
                  ) : (
                    quickAddModules.map((mod) => (
                      <SelectItem key={mod.id} value={mod.id}>
                        {moduleDisplayName(mod, mod.category_code)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Konu Adi (Turkce)</Label>
              <Input value={quickAddForm.title_tr}
                onChange={(e) => setQuickAddForm(prev => ({ ...prev, title_tr: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1" placeholder="Orn: Restoranda" required />
            </div>
            <div>
              <Label className="text-slate-300">Konu Adi (Ingilizce - Opsiyonel)</Label>
              <Input value={quickAddForm.title}
                onChange={(e) => setQuickAddForm(prev => ({ ...prev, title: e.target.value }))}
                className="bg-white/5 border-white/10 text-white mt-1" placeholder="Orn: At the Restaurant" />
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setShowQuickAddModal(false)} className="flex-1">Iptal</Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500">
                <Plus className="w-4 h-4 mr-2" />Ekle
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Kota Modal */}
      <Dialog open={!!quotaUser} onOpenChange={(open) => !open && setQuotaUser(null)}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">Kullanici Kotasi</DialogTitle>
            <DialogDescription className="text-slate-400">
              {quotaUser?.name} ({quotaUser?.email}) — limit veya bugunku kullanimi degistirin
            </DialogDescription>
          </DialogHeader>
          {quotaUser && (
            <form onSubmit={handleSaveQuota} className="space-y-5 mt-2">
              <div>
                <Label className="text-slate-300 mb-2 block">
                  Gunluk limit: {quotaForm.daily_limit_minutes} dk
                </Label>
                <Slider
                  value={[quotaForm.daily_limit_minutes]}
                  onValueChange={([v]) => setQuotaForm((f) => ({ ...f, daily_limit_minutes: v }))}
                  min={5}
                  max={240}
                  step={5}
                />
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={quotaForm.daily_limit_minutes}
                  onChange={(e) =>
                    setQuotaForm((f) => ({
                      ...f,
                      daily_limit_minutes: parseInt(e.target.value, 10) || 30,
                    }))
                  }
                  className="bg-white/5 border-white/10 text-white mt-2"
                />
              </div>
              <div>
                <Label className="text-slate-300">Bugunku kullanim (dk)</Label>
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={quotaForm.used_minutes_today}
                  onChange={(e) =>
                    setQuotaForm((f) => ({
                      ...f,
                      used_minutes_today: Math.max(0, parseInt(e.target.value, 10) || 0),
                    }))
                  }
                  className="bg-white/5 border-white/10 text-white mt-1"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Kalan: {Math.max(0, quotaForm.daily_limit_minutes - quotaForm.used_minutes_today)} dk
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  onClick={() =>
                    setQuotaForm((f) => ({
                      ...f,
                      daily_limit_minutes: f.daily_limit_minutes + 30,
                    }))
                  }
                >
                  +30 dk limit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  onClick={() => setQuotaForm((f) => ({ ...f, used_minutes_today: 0 }))}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Kullanimi sifirla
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-emerald-500/30 text-emerald-400"
                  onClick={() =>
                    setQuotaForm({
                      daily_limit_minutes: quotaUser.daily_limit_minutes ?? 30,
                      used_minutes_today: 0,
                    })
                  }
                >
                  Tam kota ver
                </Button>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setQuotaUser(null)}>
                  Iptal
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500"
                  disabled={quotaSaving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {quotaSaving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add User Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="glass border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-heading text-white">{editingUser ? 'Kullanici Duzenle' : 'Yeni Kullanici Ekle'}</DialogTitle>
            <DialogDescription className="text-slate-400">{editingUser ? 'Kullanici bilgilerini guncelleyin' : 'Sisteme yeni bir ogrenci veya yonetici ekleyin'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">Ad Soyad</Label>
              <Input value={addUserForm.name} onChange={e => setAddUserForm(f => ({...f, name: e.target.value}))}
                className="bg-white/5 border-white/10 text-white mt-1" required placeholder="Orn: Ahmet Yilmaz" />
            </div>
            <div>
              <Label className="text-slate-300">E-posta</Label>
              <Input type="email" value={addUserForm.email} onChange={e => setAddUserForm(f => ({...f, email: e.target.value}))}
                className="bg-white/5 border-white/10 text-white mt-1" required disabled={!!editingUser} placeholder="Orn: ahmet@ornek.com" />
            </div>
            <div>
              <Label className="text-slate-300">{editingUser ? 'Yeni Sifre (Opsiyonel)' : 'Sifre'}</Label>
              <Input type="password" value={addUserForm.password} onChange={e => setAddUserForm(f => ({...f, password: e.target.value}))}
                className="bg-white/5 border-white/10 text-white mt-1" required={!editingUser} placeholder={editingUser ? "Degistirmek istemiyorsaniz bos birakin" : "En az 6 karakter"} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-slate-300">Seviye</Label>
                <Select value={addUserForm.level} onValueChange={v => setAddUserForm(f => ({...f, level: v}))}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-slate-300">Gunluk Limit (dk)</Label>
                <Input type="number" value={addUserForm.daily_limit_minutes} onChange={e => setAddUserForm(f => ({...f, daily_limit_minutes: parseInt(e.target.value) || 30}))}
                  className="bg-white/5 border-white/10 text-white mt-1" required />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 mt-2">
              <div>
                <p className="text-sm text-white">Yonetici Yetkisi</p>
                <p className="text-xs text-slate-500">Kullanici admin paneline erisebilir</p>
              </div>
              <button type="button" onClick={() => setAddUserForm(f => ({...f, is_admin: !f.is_admin}))}
                className={`w-12 h-6 rounded-full transition-colors ${addUserForm.is_admin ? 'bg-indigo-600' : 'bg-slate-600'}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${addUserForm.is_admin ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setShowAddUserModal(false)} className="flex-1">Iptal</Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500">
                <Save className="w-4 h-4 mr-2" />Kaydet
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
