import { getAuthHeaders, getAiApiBase } from './apiAuth';
import { buildDidSpeakPayload, estimateSpeechMs } from './didConfig';
import { didBasicAuthHeader } from './didAuth';

/** Backend proxy veya dogrudan D-ID */
export function createDidTransport({ apiKey, useProxy }) {
  const directHeaders = () => ({
    ...didBasicAuthHeader(apiKey),
    'Content-Type': 'application/json',
  });

  const proxyHeaders = async () => ({
    ...(await getAuthHeaders()),
    'Content-Type': 'application/json',
  });

  const base = useProxy ? `${getAiApiBase()}/avatar` : 'https://api.d-id.com';

  return {
    async createStream(sourceUrl) {
      const headers = useProxy ? await proxyHeaders() : directHeaders();
      const res = await fetch(`${base}/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ source_url: sourceUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.description || data?.message || 'D-ID stream create failed');
      return data;
    },
    async postSdp(streamId, sessionId, answer) {
      const headers = useProxy ? await proxyHeaders() : directHeaders();
      await fetch(`${base}/stream/${streamId}/sdp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ answer, session_id: sessionId }),
      });
    },
    async postIce(streamId, sessionId, candidate) {
      const headers = useProxy ? await proxyHeaders() : directHeaders();
      await fetch(`${base}/stream/${streamId}/ice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          session_id: sessionId,
        }),
      });
    },
    async speak(streamId, sessionId, text, lang = 'tr') {
      const headers = useProxy ? await proxyHeaders() : directHeaders();
      const body = buildDidSpeakPayload(sessionId, text, lang);
      const res = await fetch(`${base}/stream/${streamId}/speak`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.description || data?.message || 'D-ID speak failed');
      }
    },
    async destroyStream(streamId, sessionId) {
      const headers = useProxy ? await proxyHeaders() : directHeaders();
      await fetch(`${base}/stream/${streamId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ session_id: sessionId }),
      }).catch(() => {});
    },
    waitForSpeech: (text) =>
      new Promise((r) => setTimeout(r, estimateSpeechMs(text))),
  };
}
