import axios from 'axios';
import { supabase } from './supabase';
import { getAIAPI } from '../config';

/** AI proxy istekleri icin guncel Supabase JWT */
export async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Oturum bulunamadi. Tekrar giris yapin.');
  return { Authorization: `Bearer ${token}` };
}

export function getAiApiBase() {
  return getAIAPI();
}

export async function speakText(text, lang = 'en') {
  const headers = await getAuthHeaders();
  return axios.post(
    `${getAIAPI()}/voice/speak`,
    { text: String(text || '').trim(), lang, voice: 'nova' },
    { headers }
  );
}
