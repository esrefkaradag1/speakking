/** D-ID Agents Streaming — dudak senkronlu canli avatar */

const DEFAULT_PRESENTER =
  'https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/v1_image.jpeg';

/** D-ID gercek zamanli: elevenlabs turbo (32 dil, dogal ses) */
const DID_ELEVENLABS_MODEL = 'eleven_turbo_v2_5';
/** D-ID ElevenLabs — Rachel / Sarah: acik, kadinsı ses */
const DID_ELEVEN_VOICE_FEMALE = '21m00Tcm4TlvDq8ikWAM';
const DID_ELEVEN_VOICE_EN = DID_ELEVEN_VOICE_FEMALE;
const DID_ELEVEN_VOICE_TR = DID_ELEVEN_VOICE_FEMALE;

export function getDidConfig() {
  const apiKey = (process.env.REACT_APP_DID_API_KEY || '').trim();
  const sourceUrl = (process.env.REACT_APP_DID_SOURCE_URL || '').trim() || DEFAULT_PRESENTER;
  const useProxy = process.env.REACT_APP_DID_USE_PROXY !== 'false';
  const explicitlyOn = process.env.REACT_APP_DID_ENABLED === 'true';
  const ttsProvider = (process.env.REACT_APP_DID_TTS_PROVIDER || 'elevenlabs').toLowerCase();
  return {
    enabled: explicitlyOn && (Boolean(apiKey) || useProxy),
    apiKey,
    sourceUrl,
    useProxy,
    ttsProvider,
  };
}

export function didTtsProvider() {
  return (process.env.REACT_APP_DID_TTS_PROVIDER || 'elevenlabs').toLowerCase();
}

export function didVoiceForLang(lang) {
  if (didTtsProvider() === 'elevenlabs') {
    return lang === 'en'
      ? process.env.REACT_APP_ELEVENLABS_VOICE_EN || DID_ELEVEN_VOICE_EN
      : process.env.REACT_APP_ELEVENLABS_VOICE_TR || DID_ELEVEN_VOICE_TR;
  }
  return lang === 'en' ? 'en-US-AvaMultilingualNeural' : 'tr-TR-EmelNeural';
}

/** D-ID /speak istegi — TR: Microsoft Emel (tam Turkce), EN: ElevenLabs */
export function buildDidSpeakPayload(sessionId, text, lang = 'tr') {
  const isTurkish = lang === 'tr';
  const providerType = isTurkish ? 'microsoft' : didTtsProvider();
  const voiceId = didVoiceForLang(lang);
  const script = {
    type: 'text',
    input: String(text || '').trim(),
    provider:
      providerType === 'elevenlabs'
        ? {
            type: 'elevenlabs',
            voice_id: voiceId,
            model_id: DID_ELEVENLABS_MODEL,
            voice_config: {
              stability: 0.38,
              similarity_boost: 0.75,
            },
          }
        : {
            type: 'microsoft',
            voice_id: voiceId,
          },
  };
  return {
    session_id: sessionId,
    script,
    config: { stitch: true, fluent: true },
  };
}

export function estimateSpeechMs(text) {
  const len = (text || '').length;
  return Math.min(24000, Math.max(1200, 900 + len * 52));
}
