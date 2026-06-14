/** AI asistan — talimat parse ve durum analizi */

export function parseInstructionLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length >= 3);
}

function linesWithSource(systemPrompt, customInstructions) {
  return [
    ...parseInstructionLines(systemPrompt).map((text) => ({ text, source: 'system' })),
    ...parseInstructionLines(customInstructions).map((text) => ({ text, source: 'notes' })),
  ];
}

function lineKey(item) {
  return `${item.source}::${item.text.toLowerCase()}`;
}

/** Kayıtlı vs taslak talimatları karşılaştır */
export function analyzeInstructionDiff(current, saved) {
  const cur = linesWithSource(current?.system_prompt, current?.custom_instructions);
  const sav = linesWithSource(saved?.system_prompt, saved?.custom_instructions);
  const savedKeys = new Set(sav.map(lineKey));
  const currentKeys = new Set(cur.map(lineKey));

  const items = cur.map((item) => ({
    ...item,
    status: savedKeys.has(lineKey(item)) ? 'applied' : 'draft',
  }));

  sav.forEach((item) => {
    if (!currentKeys.has(lineKey(item))) {
      items.push({ ...item, status: 'removed' });
    }
  });

  return items;
}

/** Bağlam blokları (kayıtlı ayarlara göre) */
export function buildContextBlocks(config, counts = {}) {
  if (!config) return [];
  const sentenceCount = counts.sentenceCount ?? 0;
  const docCount = counts.docCount ?? 0;
  const blocks = [
    {
      id: 'base',
      label: 'Speaky temel formatı',
      status: 'active',
      detail: 'Çeviri pratiği, [SAY_TR]/[SAY_EN], kelime paneli',
    },
  ];

  const systemText = (config.system_prompt || '').trim();
  if (systemText) {
    blocks.push({
      id: 'admin_system',
      label: 'Admin sistem talimatları',
      status: 'active',
      detail: `${parseInstructionLines(systemText).length} satır → derse eklenir`,
      preview: systemText.slice(0, 120),
    });
  } else {
    blocks.push({
      id: 'admin_system',
      label: 'Admin sistem talimatları',
      status: 'inactive',
      detail: 'Henüz talimat yok',
    });
  }

  const notesText = (config.custom_instructions || '').trim();
  if (notesText) {
    blocks.push({
      id: 'teaching_notes',
      label: 'Öğretim notları',
      status: 'active',
      detail: `${parseInstructionLines(notesText).length} satır → derse eklenir`,
      preview: notesText.slice(0, 120),
    });
  } else {
    blocks.push({
      id: 'teaching_notes',
      label: 'Öğretim notları',
      status: 'inactive',
      detail: 'Henüz not yok',
    });
  }

  if (config.use_sentence_bank) {
    blocks.push({
      id: 'sentence_bank',
      label: 'Cümle bankası',
      status: sentenceCount > 0 ? 'active' : 'warning',
      detail: `${sentenceCount} cümle · derse en fazla ${config.max_sentences_per_lesson || 10}`,
    });
  } else {
    blocks.push({
      id: 'sentence_bank',
      label: 'Cümle bankası',
      status: 'inactive',
      detail: 'Kapalı',
    });
  }

  if (config.use_documents) {
    blocks.push({
      id: 'documents',
      label: 'Dokümanlar',
      status: docCount > 0 ? 'active' : 'warning',
      detail: docCount > 0 ? `${docCount} doküman bağlama eklenir` : 'Açık ama doküman yok',
    });
  } else {
    blocks.push({
      id: 'documents',
      label: 'Dokümanlar',
      status: 'inactive',
      detail: 'Kapalı',
    });
  }

  return blocks;
}

export function appendInstruction(config, text, target = 'notes') {
  const line = String(text || '').trim();
  if (!line) return config;
  const key = target === 'system' ? 'system_prompt' : 'custom_instructions';
  const prev = (config[key] || '').trim();
  return {
    ...config,
    [key]: prev ? `${prev}\n${line}` : line,
  };
}

export function buildAssistantMessages(config, saved, instructionItems, hasDraft) {
  const applied = instructionItems.filter((i) => i.status === 'applied');
  const draft = instructionItems.filter((i) => i.status === 'draft');
  const removed = instructionItems.filter((i) => i.status === 'removed');
  const blocks = buildContextBlocks(saved || config, {});

  const msgs = [
    {
      role: 'assistant',
      text: 'Merhaba! Buradan Speaky\'nin ders davranışını yönetiyorsunuz. Verdiğiniz her talimat kaydedildiğinde modele sistem mesajına eklenir.',
    },
  ];

  const activeBlocks = blocks.filter((b) => b.status === 'active');
  if (activeBlocks.length) {
    msgs.push({
      role: 'assistant',
      text: `Şu an derste işlenen ${activeBlocks.length} bağlam kaynağı var: ${activeBlocks.map((b) => b.label).join(', ')}.`,
    });
  }

  if (applied.length) {
    msgs.push({
      role: 'system',
      text: `İşlenen talimatlar (${applied.length}):`,
      items: applied,
    });
  }

  if (draft.length) {
    msgs.push({
      role: 'warning',
      text: `${draft.length} talimat henüz kaydedilmedi — Kaydet\'e basana kadar derste kullanılmaz.`,
      items: draft,
    });
  }

  if (removed.length) {
    msgs.push({
      role: 'warning',
      text: `${removed.length} talimat metinden silindi; kaydederseniz devre dışı kalır.`,
      items: removed,
    });
  }

  if (hasDraft) {
    msgs.push({
      role: 'assistant',
      text: 'Değişiklikleri kaydettikten sonra sunucu önizlemesini yenileyerek doğrulayabilirsiniz.',
    });
  } else if (applied.length === 0 && !blocks.some((b) => b.id !== 'base' && b.status === 'active')) {
    msgs.push({
      role: 'assistant',
      text: 'Henüz özel talimat yok. Aşağıdan yeni talimat yazın veya metin alanlarına ekleyin.',
    });
  }

  return msgs;
}

export function statusLabel(status) {
  switch (status) {
    case 'applied':
      return 'İşleniyor';
    case 'draft':
      return 'Taslak';
    case 'removed':
      return 'Kaldırıldı';
    case 'active':
      return 'Aktif';
    case 'inactive':
      return 'Kapalı';
    case 'warning':
      return 'Uyarı';
    default:
      return status;
  }
}

export function statusClass(status) {
  switch (status) {
    case 'applied':
    case 'active':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'draft':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'removed':
    case 'warning':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'inactive':
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    default:
      return 'bg-slate-500/20 text-slate-400';
  }
}
