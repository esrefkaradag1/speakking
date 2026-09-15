import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Loader2 } from 'lucide-react';
import axios from 'axios';
import { getAIAPI } from '../config';
import { getAuthHeaders } from '../lib/apiAuth';
import { LESSON_VIDEOS, waitForMediaReady } from '../lib/lessonMedia';

/**
 * teacher.png + D-ID Talks: sohbet metnini birebir dudak senkronuyla okur.
 * Idle'da video2 dongusu; konusurken D-ID sonucu.
 */
const PhotoTalkAvatar = forwardRef(
  (
    {
      active = true,
      photoUrl = LESSON_VIDEOS.teacherPhoto,
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
    const statusRef = useRef('idle');
    const sourceUrlRef = useRef(null);
    const onReadyRef = useRef(onReady);
    const onFailedRef = useRef(onFailed);
    onReadyRef.current = onReady;
    onFailedRef.current = onFailed;

    const [status, setStatus] = useState('idle');
    const [busy, setBusy] = useState(false);
    const [speaking, setSpeaking] = useState(false);

    useEffect(() => {
      if (!active) {
        statusRef.current = 'idle';
        setStatus('idle');
        return undefined;
      }
      // Zaten hazirsa tekrar yukleme
      if (sourceUrlRef.current && statusRef.current === 'ready') {
        onReadyRef.current?.();
        return undefined;
      }

      let cancelled = false;
      (async () => {
        try {
          statusRef.current = 'connecting';
          setStatus('connecting');
          const res = await axios.get(`${getAIAPI()}/avatar/photo-source`, {
            headers: await getAuthHeaders(),
            timeout: 90000,
          });
          if (cancelled) return;
          if (!res.data?.source_url) throw new Error('source_url yok');
          sourceUrlRef.current = res.data.source_url;
          statusRef.current = 'ready';
          setStatus('ready');
          onReadyRef.current?.();
        } catch (err) {
          if (cancelled) return;
          console.warn('PhotoTalk hazirlanamadi:', err?.message || err);
          statusRef.current = 'error';
          setStatus('error');
          onFailedRef.current?.(err);
        }
      })();

      return () => {
        cancelled = true;
      };
      // Sadece active degisince — callback'ler ref'te
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    useEffect(() => {
      const el = idleRef.current;
      if (!el || !active) return undefined;
      el.muted = true;
      el.loop = true;
      el.play().catch(() => {});
      return () => {
        el.pause();
      };
    }, [active, idleVideoUrl]);

    const waitForTalkResult = async (talkId) => {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const res = await axios.get(`${getAIAPI()}/avatar/talk/${talkId}`, {
          headers: await getAuthHeaders(),
          timeout: 30000,
        });
        const st = res.data?.status;
        if (st === 'done' && res.data?.result_url) {
          return res.data.result_url;
        }
        if (st === 'error' || st === 'rejected') {
          throw new Error(res.data?.error?.description || 'Dudak senkronu basarisiz');
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      throw new Error('Dudak senkronu zaman asimina ugradi');
    };

    const playResult = async (url) => {
      const el = videoRef.current;
      if (!el) throw new Error('Video yok');
      el.pause();
      el.loop = false;
      el.muted = false;
      el.volume = 1;
      el.src = url;
      await waitForMediaReady(el, 45000);
      setSpeaking(true);
      onSpeakStart?.();
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
      setSpeaking(false);
      onSpeakEnd?.();
    };

    useImperativeHandle(ref, () => ({
      isConnected: () => statusRef.current === 'ready' && active,
      speakAndWait: async (text, lang = 'tr', opts = {}) => {
        const { isCancelled, onSpeakStart: onStart, onSpeakEnd: onEnd } = opts;
        if (!active || statusRef.current !== 'ready') {
          throw new Error('PhotoTalk hazir degil');
        }
        const trimmed = String(text || '').trim();
        if (!trimmed) return;
        if (isCancelled?.()) return;

        setBusy(true);
        try {
          const create = await axios.post(
            `${getAIAPI()}/avatar/talk`,
            {
              text: trimmed,
              lang: lang === 'en' ? 'en' : 'tr',
              source_url: sourceUrlRef.current || undefined,
            },
            { headers: await getAuthHeaders(), timeout: 90000 }
          );
          const talkId = create.data?.id;
          if (!talkId) throw new Error('Talk olusturulamadi');
          if (isCancelled?.()) return;

          const resultUrl = await waitForTalkResult(talkId);
          if (isCancelled?.()) return;

          onStart?.();
          await playResult(resultUrl);
          onEnd?.();
        } catch (err) {
          const status = err?.response?.status;
          const detail = String(
            err?.response?.data?.detail ||
              err?.response?.data?.description ||
              err?.message ||
              ''
          );
          const noCredits =
            status === 402 ||
            /InsufficientCredits|not enough credits|payment required/i.test(detail);
          console.warn('PhotoTalk speak hatasi:', detail || err);
          if (noCredits) {
            statusRef.current = 'error';
            setStatus('error');
            onFailedRef.current?.(err);
          }
          throw err;
        } finally {
          setBusy(false);
          setSpeaking(false);
          if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.removeAttribute('src');
          }
        }
      },
    }));

    return (
      <div className="absolute inset-0 w-full h-full bg-slate-950">
        <video
          ref={idleRef}
          src={idleVideoUrl}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            speaking || busy ? 'opacity-0' : 'opacity-100'
          }`}
          loop
          muted
          autoPlay
          playsInline
          preload="auto"
        />
        <img
          src={photoUrl}
          alt="Ogretmen"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            speaking ? 'opacity-0' : busy ? 'opacity-40' : 'opacity-70'
          }`}
        />
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover z-[1] transition-opacity duration-200 ${
            speaking ? 'opacity-100' : 'opacity-0'
          }`}
          playsInline
          preload="auto"
        />
        {(busy || status === 'connecting') && (
          <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center bg-slate-900/50">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
            <p className="text-xs text-slate-200">
              {status === 'connecting'
                ? 'Gercek ogretmen hazirlaniyor…'
                : 'Dudak senkronu uretiliyor…'}
            </p>
          </div>
        )}
        {status === 'ready' && !busy && (
          <div className="absolute top-4 right-4 z-[4] flex items-center gap-2 px-3 py-1 bg-black/35 rounded-full backdrop-blur-sm pointer-events-none text-white/85 text-xs">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>Canli Ogretmen · Dudak Senkronu</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[4] text-xs text-amber-300 bg-black/50 px-3 py-1 rounded-full">
            D-ID kredi yok — video yedegine geciliyor
          </div>
        )}
      </div>
    );
  }
);

PhotoTalkAvatar.displayName = 'PhotoTalkAvatar';

export default PhotoTalkAvatar;
