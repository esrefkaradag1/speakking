import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';
import { LESSON_VIDEOS, waitForMediaReady } from '../lib/lessonMedia';
import { fetchTtsAudio, synthesizeLipSyncFromAudio } from '../lib/wav2lipApi';

/**
 * Tek TTS (insan sesi) + ayni sesle uretilen video.
 * Video sessiz oynar; ses audio elementinden gelir — kayma olmaz.
 */
const Wav2LipAvatar = forwardRef(
  (
    {
      active = true,
      audioRef,
      idleVideoUrl = LESSON_VIDEOS.idle,
      welcomeVideoUrl = LESSON_VIDEOS.welcome,
      onReady,
      onFailed,
      onSpeakStart,
      onSpeakEnd,
    },
    ref
  ) => {
    const videoRef = useRef(null);
    const idleRef = useRef(null);
    const welcomeRef = useRef(null);
    const internalAudioRef = useRef(null);
    const [status, setStatus] = useState('idle');
    const [syncing, setSyncing] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

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

    /** Video (sessiz) + TTS sesi ayni anda baslar / biter */
    const playSynced = async (videoUrl, audioUrl, { isCancelled, onStart, onEnd } = {}) => {
      const videoEl = videoRef.current;
      const audioEl = getAudioEl();
      if (!videoEl || !audioEl) throw new Error('Media elementi yok');
      if (isCancelled?.()) return;

      videoEl.pause();
      audioEl.pause();

      videoEl.loop = false;
      videoEl.muted = true;
      videoEl.volume = 0;
      videoEl.src = videoUrl;

      audioEl.loop = false;
      audioEl.muted = false;
      audioEl.volume = 1;
      audioEl.src = audioUrl;

      await Promise.all([waitForMediaReady(videoEl), waitForMediaReady(audioEl)]);
      if (isCancelled?.()) return;

      try {
        videoEl.currentTime = 0;
        audioEl.currentTime = 0;
      } catch {
        /* ignore */
      }

      setIsSpeaking(true);
      onStart?.();
      onSpeakStart?.();

      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (err) reject(err);
          else resolve();
        };
        const onAudioEnded = () => finish();
        const onAudioError = () => finish(audioEl.error || new Error('Ses oynatilamadi'));
        const onVideoError = () => {
          /* video hata verse bile ses bitsin diye sesi takip et */
        };
        const cleanup = () => {
          audioEl.removeEventListener('ended', onAudioEnded);
          audioEl.removeEventListener('error', onAudioError);
          videoEl.removeEventListener('error', onVideoError);
        };

        audioEl.addEventListener('ended', onAudioEnded, { once: true });
        audioEl.addEventListener('error', onAudioError, { once: true });
        videoEl.addEventListener('error', onVideoError, { once: true });

        Promise.all([videoEl.play(), audioEl.play()])
          .then(() => {
            const syncDrift = () => {
              if (settled || isCancelled?.()) return;
              if (Math.abs(videoEl.currentTime - audioEl.currentTime) > 0.12) {
                try {
                  videoEl.currentTime = audioEl.currentTime;
                } catch {
                  /* ignore */
                }
              }
              requestAnimationFrame(syncDrift);
            };
            requestAnimationFrame(syncDrift);
          })
          .catch((err) => finish(err));
      });

      videoEl.pause();
      audioEl.pause();
      setIsSpeaking(false);
      onEnd?.();
      onSpeakEnd?.();
    };

    useImperativeHandle(ref, () => ({
      isConnected: () => status === 'ready' && active,
      playWelcome: async () => {
        const el = welcomeRef.current;
        if (!el || !welcomeVideoUrl) return;
        setShowWelcome(true);
        el.loop = false;
        el.muted = false;
        el.volume = 1;
        el.currentTime = 0;
        await new Promise((resolve) => {
          const done = () => {
            el.removeEventListener('ended', done);
            el.removeEventListener('error', done);
            resolve();
          };
          el.addEventListener('ended', done, { once: true });
          el.addEventListener('error', done, { once: true });
          el.play().catch(done);
        });
        el.pause();
        el.muted = true;
        setShowWelcome(false);
      },
      speakAndWait: async (text, lang = 'tr', opts = {}) => {
        const { isCancelled, onSpeakStart: onStart, onSpeakEnd: onEnd } = opts;
        if (!active || status !== 'ready') {
          throw new Error('Wav2Lip hazir degil');
        }
        const trimmed = String(text || '').trim();
        if (!trimmed) return;

        let audioUrl = null;
        let videoUrl = null;
        try {
          setSyncing(true);
          // Tek insan sesi (Cartesia)
          const tts = await fetchTtsAudio(trimmed, lang);
          audioUrl = tts.url;
          if (isCancelled?.()) return;

          // Ayni ses baytlariyla video
          const sync = await synthesizeLipSyncFromAudio(tts.audioBase64, tts.format);
          videoUrl = sync.url;
          setSyncing(false);
          if (isCancelled?.()) return;

          if (idleRef.current) idleRef.current.classList.add('opacity-0');
          await playSynced(videoUrl, audioUrl, {
            isCancelled,
            onStart,
            onEnd,
          });
        } catch (err) {
          onFailed?.(err);
          throw err;
        } finally {
          setSyncing(false);
          setIsSpeaking(false);
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          if (videoUrl) URL.revokeObjectURL(videoUrl);
          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
          }
          const audioEl = getAudioEl();
          if (audioEl) {
            audioEl.pause();
            audioEl.removeAttribute('src');
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
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            showWelcome || isSpeaking ? 'opacity-0' : 'opacity-100'
          }`}
          loop
          muted
          autoPlay
          playsInline
          preload="auto"
        />
        <video
          ref={welcomeRef}
          src={welcomeVideoUrl}
          className={`absolute inset-0 w-full h-full object-cover z-[2] transition-opacity duration-200 ${
            showWelcome ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          playsInline
          preload="auto"
        />
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover z-[1] transition-opacity duration-150 ${
            isSpeaking ? 'opacity-100' : 'opacity-0'
          }`}
          playsInline
          muted
          preload="auto"
        />
        {syncing && (
          <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center bg-slate-900/40">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
            <p className="text-xs text-slate-300">Dudak senkronu hazırlanıyor…</p>
          </div>
        )}
        {status === 'ready' && !syncing && !showWelcome && (
          <div className="absolute top-4 right-4 z-[4] flex items-center gap-2 px-3 py-1 bg-black/30 rounded-full backdrop-blur-sm pointer-events-none text-white/80 text-xs">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>Canli Ogretmen · Dudak Senkronu</span>
          </div>
        )}
      </div>
    );
  }
);

Wav2LipAvatar.displayName = 'Wav2LipAvatar';

export default Wav2LipAvatar;
