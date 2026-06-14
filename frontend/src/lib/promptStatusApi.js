import { getAIAPI } from '../config';
import { supabase } from './supabase';

/** Sunucunun derste hangi prompt parçalarını kullandığını doğrula */
export async function fetchPromptStatus(counts = {}) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  if (!token) throw new Error('Oturum gerekli');

  const params = new URLSearchParams();
  if (counts.sentenceCount != null) params.set('sentence_count', String(counts.sentenceCount));
  if (counts.docCount != null) params.set('doc_count', String(counts.docCount));

  const res = await fetch(`${getAIAPI()}/admin/prompt-status?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Prompt durumu alınamadı');
  }
  return res.json();
}
