import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';
import { LESSON_VIDEOS, playAudioUrl, waitForMediaReady } from '../lib/lessonMedia';
import { fetchTtsAudioUrl, synthesizeLipSyncVideo } from '../lib/wav2lipApi';

/**
 * Ders modu: TTS sesi aninda oynatilir (video beklenmez).
 * audioRef verilirse ses–video kaymasi olmaz.
 */
const Wav2LipAvatar = forwardRef(
  (
    {
      active = true,
      audioRef,
      idleVideoUrl = LESSON_VIDEOS.idle,
      onReady,
      onFailed,
      onSpeakStart,
      onSpeakEnd,
    },
    ref
  ) => {
    const videoRef = useRef(null);
    const idleRef = useRef(null);
    const internalAudioRef = useRef(null);
    const [status, setStatus] = useState('idle');
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
      if (!active) {
        setStatus('idle');
        return undefined;
      }
      setStatus('ready');
      onReady?.();
      return undefined;
    }, [active, onReady]);

    const getAudioEl = () => audioRef?.current || internalAudioRef.current;

    const playVideoUrl = async (url) => {
      const el = videoRef.current;
      if (!el) throw new Error('Video elementi yok');
      el.pause();
      el.loop = false;
      el.muted = false;
      el.volume = 1;
      el.src = url;
      await waitForMediaReady(el);
      await new Promise((resolve, reject) => {
        const onEnded = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(el.error || new Error('Video oynatilamadi'));
        };
        const cleanup = () => {
          el.removeEventListener('ended', onEnded);
          el.removeEventListener('error', onError);
        };
        el.addEventListener('ended', onEnded, { once: true });
        el.addEventListener('error', onError, { once: true });
        el.play().catch(reject);
      });
    };

    useImperativeHandle(ref, () => ({
      isConnected: () => status === 'ready' && active,
      speakAndWait: async (text, lang = 'tr', opts = {}) => {
        const { isCancelled, onSpeakStart: onStart, onSpeakEnd: onEnd } = opts;
        if (!active || status !== 'ready') {
          throw new Error('Wav2Lip hazir degil');
        }
        const trimmed = String(text || '').trim();
        if (!trimmed) return;

        let audioUrl = null;
        try {
          setSyncing(true);
          const { url } = await fetchTtsAudioUrl(trimmed, lang);
          audioUrl = url;

          if (idleRef.current) idleRef.current.classList.add('opacity-0');
          const videoUrl = await synthesizeLipSyncVideo(trimmed, lang);
          setSyncing(false);
          onStart?.();
          await playVideoUrl(videoUrl);
          onEnd?.();
          URL.revokeObjectURL(videoUrl);
        } catch (err) {
          onFailed?.(err);
          throw err;
        } finally {
          setSyncing(false);
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
          }
          if (idleRef.current) idleRef.current.classList.remove('opacity-0');
        }
      },
    }));

    return (
      <div className="absolute inset-0 w-full h-full">
        <audio ref={internalAudioRef} className="hidden" preload="auto" />
        <video
          ref={idleRef}
          src={idleVideoUrl}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          loop
          muted
          autoPlay
          playsInline
          preload="auto"
        />
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover z-[1]"
          playsInline
          preload="auto"
        />
        {syncing && (
          <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center bg-slate-900/40">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
            <p className="text-xs text-slate-300">Ses hazırlanıyor…</p>
          </div>
        )}
      </div>
    );
  }
);

Wav2LipAvatar.displayName = 'Wav2LipAvatar';

export default Wav2LipAvatar;
