import React, {
  forwardRef,
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
} from 'react';
import { TalkingHead } from '@met4citizen/talkinghead';

const AVATAR_URL = '/julia.glb';
// Dar/agiz acan visemeler — sadece konusmaya uygun olanlar
const LIP_VISEMES = ['viseme_PP', 'viseme_FF', 'viseme_E', 'viseme_I', 'viseme_aa'];

// Agiz acikligi tavanlari (0–1). Fazla acilmayi onler.
const LIP_LIMITS = {
  viseme: 0.32,
  visemeWide: 0.22, // viseme_aa icin daha dusuk
  jaw: 0.18,
};

// Tek WebGL context — React StrictMode unmount/remount'ta yeniden yaratmayi onle
let sharedHead = null;
let sharedInitPromise = null;
let sharedContainer = null;
let mountCount = 0;
let disposeTimer = null;

function safeDisposeHead(head) {
  if (!head) return;
  try {
    if (head.armature) {
      head.stopSpeaking?.();
      head.dispose?.();
      return;
    }
    head.stopSpeaking?.();
    head.stop?.();
    if (head.renderer) {
      head.renderer.dispose();
      head.renderer.domElement?.remove();
      head.renderer.getContext()?.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (err) {
    console.warn('TalkingHead safeDispose:', err);
  }
}

function reattachHead(head, container) {
  if (!head || !container || head.nodeAvatar === container) return;

  if (head.resizeobserver) {
    head.resizeobserver.disconnect();
  }

  if (head.renderer?.domElement) {
    container.appendChild(head.renderer.domElement);
  }

  head.nodeAvatar = container;
  head.resizeobserver = new ResizeObserver(head.onResize.bind(head));
  head.resizeobserver.observe(container);
  head.onResize?.();
}

async function ensureSharedHead(container) {
  if (sharedHead) {
    reattachHead(sharedHead, container);
    sharedContainer = container;
    if (!sharedHead.isRunning) {
      sharedHead.start();
    }
    return sharedHead;
  }

  if (!sharedInitPromise) {
    sharedInitPromise = (async () => {
      const head = new TalkingHead(container, {
        cameraView: 'upper',
        cameraRotateEnable: false,
        cameraPanEnable: false,
        cameraZoomEnable: false,
        lipsyncLang: 'en',
        lipsyncModules: [],
      });

      await head.showAvatar({
        url: AVATAR_URL,
        body: 'F',
        avatarMood: 'neutral',
        lipsyncLang: 'en',
      });
      head.start();
      sharedHead = head;
      sharedContainer = container;
      return head;
    })().catch((err) => {
      sharedInitPromise = null;
      throw err;
    });
  }

  const head = await sharedInitPromise;
  reattachHead(head, container);
  sharedContainer = container;
  return head;
}

function scheduleSharedDispose() {
  if (disposeTimer) clearTimeout(disposeTimer);
  disposeTimer = setTimeout(() => {
    if (mountCount === 0 && sharedHead) {
      safeDisposeHead(sharedHead);
      sharedHead = null;
      sharedInitPromise = null;
      sharedContainer = null;
    }
  }, 800);
}

function clearLipTargets(head) {
  [...LIP_VISEMES, 'jawOpen'].forEach((name) => {
    const mt = head.mtAvatar?.[name];
    if (mt) {
      mt.realtime = null;
      mt.needsUpdate = true;
    }
  });
}

/** Ses seviyesine gore tek, hafif agiz sekli */
function applySubtleLipShapes(head, vol) {
  const normalized = Math.min(vol / 130, 1);
  const level = Math.max(0.06, normalized * LIP_LIMITS.viseme);

  let activeViseme = 'viseme_E';
  if (normalized < 0.25) activeViseme = 'viseme_PP';
  else if (normalized < 0.5) activeViseme = 'viseme_I';
  else if (normalized > 0.75) activeViseme = 'viseme_aa';

  LIP_VISEMES.forEach((name) => {
    const mt = head.mtAvatar?.[name];
    if (!mt) return;
    if (name === activeViseme) {
      const cap = name === 'viseme_aa' ? LIP_LIMITS.visemeWide : LIP_LIMITS.viseme;
      mt.realtime = Math.min(level, cap);
    } else {
      mt.realtime = null;
    }
    mt.needsUpdate = true;
  });

  const jaw = head.mtAvatar?.jawOpen;
  if (jaw) {
    jaw.realtime = Math.min(level * 0.55, LIP_LIMITS.jaw);
    jaw.needsUpdate = true;
  }
}

function startSubtleLipSync(head) {
  let rafId = null;
  let active = true;

  const loop = () => {
    if (!active) return;

    const speaking = Boolean(head.isSpeaking || head.isAudioPlaying);
    if (speaking) {
      let vol = 0;
      if (head.audioAnalyzerNode && head.volumeFrequencyData) {
        head.audioAnalyzerNode.getByteFrequencyData(head.volumeFrequencyData);
        for (let i = 2; i < 10; i += 1) {
          vol = Math.max(vol, head.volumeFrequencyData[i]);
        }
      }
      applySubtleLipShapes(head, vol);
    } else {
      clearLipTargets(head);
    }

    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);

  return () => {
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    clearLipTargets(head);
  };
}

function startSubtleExternalLipSync(head, getAudioEl, getTalking) {
  let rafId = null;

  const loop = () => {
    const audioEl = getAudioEl();
    const talking = getTalking();
    const headSpeaking = Boolean(head.isSpeaking || head.isAudioPlaying);
    const playing = Boolean(audioEl && !audioEl.paused && talking);

    if (!playing || headSpeaking) {
      if (!headSpeaking) clearLipTargets(head);
      rafId = requestAnimationFrame(loop);
      return;
    }

    let vol = 35;
    const analyser = audioEl?._analyserNode;
    if (analyser) {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      vol = data.reduce((sum, v) => sum + v, 0) / data.length;
    }
    applySubtleLipShapes(head, vol);

    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    clearLipTargets(head);
  };
}

function waitForSpeechEnd(head, { isCancelled, onSpeakStart, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let started = false;

    const poll = () => {
      if (isCancelled?.()) {
        head.stopSpeaking();
        resolve();
        return;
      }

      const playing = Boolean(head.isSpeaking || head.isAudioPlaying);
      if (!started && playing) {
        started = true;
        onSpeakStart?.();
      }

      if (started && !playing && head.speechQueue.length === 0 && head.audioPlaylist.length === 0) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        head.stopSpeaking();
        reject(new Error('3D avatar speech timeout'));
        return;
      }

      setTimeout(poll, 40);
    };

    setTimeout(poll, 60);
  });
}

const ThreeAvatar = forwardRef(
  ({ active, audioRef, isTalking, onReady, className = '' }, ref) => {
    const containerRef = useRef(null);
    const headRef = useRef(null);
    const onReadyRef = useRef(onReady);
    const isReadyRef = useRef(false);
    const isTalkingRef = useRef(isTalking);
    const audioRefProp = useRef(audioRef);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
      onReadyRef.current = onReady;
    }, [onReady]);

    useEffect(() => {
      isTalkingRef.current = isTalking;
    }, [isTalking]);

    useEffect(() => {
      audioRefProp.current = audioRef;
    }, [audioRef]);

    useEffect(() => {
      isReadyRef.current = isReady;
    }, [isReady]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return undefined;

      mountCount += 1;
      if (disposeTimer) {
        clearTimeout(disposeTimer);
        disposeTimer = null;
      }

      let cancelled = false;

      ensureSharedHead(container)
        .then((head) => {
          if (cancelled) return;
          headRef.current = head;
          isReadyRef.current = true;
          setIsReady(true);
          onReadyRef.current?.();
        })
        .catch((err) => {
          console.error('TalkingHead initialization failed:', err);
        });

      return () => {
        cancelled = true;
        headRef.current = null;
        isReadyRef.current = false;
        setIsReady(false);
        mountCount = Math.max(0, mountCount - 1);
        scheduleSharedDispose();
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        isConnected: () => Boolean(isReadyRef.current && headRef.current),
        speakAndWait: async (text, lang = 'tr', opts = {}) => {
          const { blobUrl, isCancelled, onSpeakStart, onSpeakEnd } = opts;
          const head = headRef.current || sharedHead;
          if (!head || !isReadyRef.current) {
            throw new Error('3D avatar hazir degil');
          }

          const trimmed = String(text || '').trim();
          if (!trimmed || !blobUrl) {
            throw new Error('TTS sesi yok');
          }

          if (head.audioCtx?.state === 'suspended') {
            await head.audioCtx.resume();
          }

          head.stopSpeaking();

          const response = await fetch(blobUrl);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await head.audioCtx.decodeAudioData(arrayBuffer.slice(0));

          // Sadece ses — viseme animasyonu TalkingHead yerine hafif ses-analizi ile
          const stopLipSync = startSubtleLipSync(head);
          head.speakAudio({ audio: audioBuffer }, { isRaw: true });

          try {
            await waitForSpeechEnd(head, { isCancelled, onSpeakStart });
          } finally {
            stopLipSync();
            onSpeakEnd?.();
          }
        },
      }),
      []
    );

    // Fallback: paylasilan <audio> ile oynatildiginda da agzi hareket ettir
    useEffect(() => {
      if (!isReady || !headRef.current || !audioRef?.current) return undefined;

      const head = headRef.current;
      const audioEl = audioRef.current;

      try {
        if (!audioEl._audioContext) {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const analyserNode = audioContext.createAnalyser();
          analyserNode.fftSize = 64;
          const source = audioContext.createMediaElementSource(audioEl);
          source.connect(analyserNode);
          analyserNode.connect(audioContext.destination);
          audioEl._audioContext = audioContext;
          audioEl._analyserNode = analyserNode;
        }
      } catch (err) {
        console.warn('AudioContext init failed:', err);
      }

      const stop = startSubtleExternalLipSync(
        head,
        () => audioRefProp.current?.current,
        () => isTalkingRef.current
      );

      return stop;
    }, [isReady, audioRef]);

    return (
      <div
        className={`absolute inset-0 w-full h-full bg-slate-900 ${className}`}
        style={{ zIndex: 20, visibility: active ? 'visible' : 'hidden' }}
      >
        <div ref={containerRef} className="w-full h-full" />
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-black/30 rounded-full backdrop-blur-sm pointer-events-none text-white/70 text-xs">
          <div className={`w-2 h-2 rounded-full ${isTalking ? 'bg-green-400 animate-pulse' : 'bg-slate-400'}`} />
          <span>3D Avatar {isTalking ? 'Konuşuyor' : isReady ? 'Hazır' : 'Yükleniyor'}</span>
        </div>
      </div>
    );
  }
);

ThreeAvatar.displayName = 'ThreeAvatar';

export default ThreeAvatar;
