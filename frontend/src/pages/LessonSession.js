import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Mic, MicOff, ArrowLeft, Clock, Send, 
  CheckCircle, Volume2, VolumeX, Loader2, HelpCircle, Lightbulb,
  BookOpen, AlertTriangle, Sparkles
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import DIDAvatar from '../components/DIDAvatar';
import Wav2LipAvatar from '../components/Wav2LipAvatar';
import ThreeAvatar from '../components/ThreeAvatar';

import { getAuthHeaders, getAiApiBase, speakText } from '../lib/apiAuth';
import { endLesson } from '../lib/lessonApi';
import { inferTtsSegments, expandSegmentsToSentences } from '../lib/ttsSegments';
import {
  extractChallengeTurkishSentence,
  segmentsBeforeUserAnswer,
} from '../lib/lessonHints';
import {
  LESSON_VIDEOS,
  unlockAudioElement,
  waitAfterMessageReveal,
  playAudioUrl,
  speakWithBrowserTts,
  prefetchTtsBlobs,
} from '../lib/lessonMedia';
import { getDidConfig } from '../lib/didConfig';
import { getWav2lipConfig, avatarProviderPriority, isWav2lipOnly } from '../lib/wav2lipConfig';
import { checkWav2lipHealth } from '../lib/wav2lipApi';
import { checkAiBackend } from '../lib/aiHealth';

// ==================== HINT HELPER (Hangman) ====================
const HintHelper = ({ sentence, turkishPreview, loading, onHintUsed, variant = 'default' }) => {
  const isWide = variant === 'wide';
  const [revealedIndices, setRevealedIndices] = useState(new Set());
  const [hintsUsed, setHintsUsed] = useState(0);

  useEffect(() => {
    setRevealedIndices(new Set());
    setHintsUsed(0);
  }, [sentence, turkishPreview]);

  const displaySentence = loading ? '' : (sentence || '');
  const letterPositions = displaySentence.split('').map((char, idx) => ({
    char,
    idx,
    isLetter: /[a-zA-Z]/.test(char),
  }));

  const totalLetters = letterPositions.filter((p) => p.isLetter).length;
  const hiddenLetterCount = letterPositions.filter(
    (p) => p.isLetter && !revealedIndices.has(p.idx)
  ).length;

  const revealNextLetter = () => {
    if (loading || !displaySentence) return;
    const hiddenPositions = letterPositions
      .filter((p) => p.isLetter && !revealedIndices.has(p.idx))
      .map((p) => p.idx);
    if (hiddenPositions.length === 0) return;
    const randomIdx = hiddenPositions[Math.floor(Math.random() * hiddenPositions.length)];
    setRevealedIndices((prev) => new Set([...prev, randomIdx]));
    setHintsUsed((prev) => {
      const next = prev + 1;
      if (onHintUsed) onHintUsed(next);
      return next;
    });
  };

  const letterGrid = (
    <div
      className={`flex flex-wrap gap-1 font-mono ${isWide ? 'text-base justify-center' : 'text-lg mb-4'}`}
    >
      {letterPositions.map((pos, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center justify-center min-w-[1.5rem] h-8 rounded
            ${
              pos.isLetter
                ? revealedIndices.has(pos.idx)
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-slate-800 text-slate-600 border border-slate-700'
                : 'text-slate-400'
            }`}
        >
          {pos.isLetter ? (revealedIndices.has(pos.idx) ? pos.char : '_') : pos.char}
        </span>
      ))}
    </div>
  );

  const progressBar =
    totalLetters > 0 ? (
      <div className={`h-1.5 bg-slate-800 rounded-full overflow-hidden ${isWide ? 'w-full max-w-xs' : 'mb-3'}`}>
        <motion.div
          className="h-full bg-gradient-to-r from-amber-500 to-emerald-500"
          initial={{ width: 0 }}
          animate={{
            width: `${((totalLetters - hiddenLetterCount) / totalLetters) * 100}%`,
          }}
        />
      </div>
    ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        isWide
          ? 'w-full p-3 rounded-xl border border-amber-500/30 bg-amber-500/5'
          : 'glass p-4 rounded-xl border border-amber-500/30 bg-amber-500/5'
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Yeni soru yükleniyor…
        </div>
      ) : !displaySentence ? (
        <p className="text-xs text-slate-500 text-center py-4">Cevap henüz hazır değil</p>
      ) : isWide ? (
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="shrink-0 lg:w-[200px]">
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">Kopya Modülü</span>
            </div>
            {turkishPreview && (
              <p className="text-[10px] text-slate-500 line-clamp-2 italic" title={turkishPreview}>
                {turkishPreview}
              </p>
            )}
            <span className="text-[10px] text-slate-500 mt-1 block">{hintsUsed} ipucu</span>
          </div>
          <div className="flex-1 min-w-0">{letterGrid}</div>
          <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2 lg:w-[140px]">
            {progressBar}
            <span className="text-xs text-slate-500 text-center sm:text-right">
              {totalLetters - hiddenLetterCount} / {totalLetters} harf
            </span>
            <Button
              onClick={revealNextLetter}
              disabled={hiddenLetterCount === 0 || totalLetters === 0}
              size="sm"
              className="bg-amber-600 hover:bg-amber-500 text-white w-full sm:w-auto"
              data-testid="hint-btn"
            >
              <HelpCircle className="w-4 h-4 mr-1" />
              Harf Aç
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <span className="text-sm font-medium text-amber-400">Adam Asmaca</span>
            </div>
            <span className="text-xs text-slate-400">{hintsUsed} ipucu</span>
          </div>
          {turkishPreview && (
            <p className="text-[10px] text-slate-500 mb-2 line-clamp-2 italic" title={turkishPreview}>
              Soru: {turkishPreview}
            </p>
          )}
          {letterGrid}
          {progressBar}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {totalLetters - hiddenLetterCount} / {totalLetters} harf açıldı
            </span>
            <Button
              onClick={revealNextLetter}
              disabled={hiddenLetterCount === 0 || totalLetters === 0}
              size="sm"
              className="bg-amber-600 hover:bg-amber-500 text-white"
              data-testid="hint-btn"
            >
              <HelpCircle className="w-4 h-4 mr-1" />
              Harf Aç
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
};

// ==================== STRUCTURED CORRECTION CARD ====================
const CorrectionCard = ({ correction }) => {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="glass p-4 border-l-4 border-red-500/70 bg-red-500/5" data-testid="correction-card">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">Duzeltme</span>
      </div>
      <div className="space-y-2">
        {correction.turkish && (
          <div>
            <span className="text-[10px] uppercase text-slate-500 tracking-wider">Turkce</span>
            <p className="text-xs text-slate-400 italic">{correction.turkish}</p>
          </div>
        )}
        <div>
          <span className="text-[10px] uppercase text-slate-500 tracking-wider">Senin Cevabin</span>
          <p className="text-sm text-red-300 line-through">{correction.original}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase text-slate-500 tracking-wider">Dogru Cevap</span>
          <p className="text-sm text-emerald-400 font-medium">{correction.correction}</p>
        </div>
        {correction.explanation && (
          <div className="pt-1 border-t border-white/5">
            <span className="text-[10px] uppercase text-slate-500 tracking-wider">Aciklama</span>
            <p className="text-xs text-slate-300">{correction.explanation}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ==================== VOCABULARY HINT CARD ====================
const VocabularyCard = ({ vocab }) => {
  const [playing, setPlaying] = useState(false);

  const pronounce = async () => {
    try {
      setPlaying(true);
      const res = await speakText(vocab.example || vocab.word, 'en');
      const audioBlob = base64ToBlob(res.data.audio, 'audio/mp3');
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audio.onended = () => setPlaying(false);
      audio.play();
    } catch {
      setPlaying(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="glass p-3 border-l-4 border-indigo-500/70 bg-indigo-500/5 group" data-testid="vocabulary-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-indigo-300">{vocab.word}</span>
        <button onClick={pronounce} disabled={playing}
          className="p-1 text-slate-500 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100"
          data-testid={`pronounce-${vocab.word}`}>
          <Volume2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {vocab.meaning && vocab.meaning !== 'ders kelimesi' && (
        <p className="text-xs text-emerald-400 mb-1">{vocab.meaning}</p>
      )}
      {vocab.example && (
        <p className="text-[11px] text-slate-400 italic">"{vocab.example}"</p>
      )}
    </motion.div>
  );
};

// ==================== SPEAKY CHARACTER ====================
const SpeakyCharacter = ({ size = "md", isTalking = false }) => {
  const sizeClasses = { sm: "w-12 h-12", md: "w-16 h-16", lg: "w-24 h-24" };
  return (
    <motion.div className={`${sizeClasses[size]} relative`}
      animate={isTalking ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.5, repeat: isTalking ? Infinity : 0 }}>
      <img src="https://images.unsplash.com/photo-1656229181541-a42184b5625c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjV8MHwxfHNlYXJjaHw0fHxmcmllbmRseSUyMGZlbWFsZSUyMEFJJTIwYXNzaXN0YW50JTIwYXZhdGFyJTIwM0QlMjBjaGFyYWN0ZXJ8ZW58MHx8fHwxNzc1NDU5MzgwfDA&ixlib=rb-4.1.0&q=85&w=400"
        alt="Speaky"
        className={`w-full h-full object-cover rounded-full border-2 ${isTalking ? 'border-emerald-400 shadow-emerald-500/50' : 'border-indigo-500/50 shadow-indigo-500/30'} shadow-lg transition-all duration-300`} />
      {isTalking && (
        <motion.div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center"
          animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.3, repeat: Infinity }}>
          <Volume2 className="w-3 h-3 text-white" />
        </motion.div>
      )}
    </motion.div>
  );
};

// ==================== HELPER ====================
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

const BETWEEN_SENTENCE_MS = 220;

function cumulativeSentenceText(parts, throughIdx) {
  return parts
    .slice(0, throughIdx + 1)
    .map((p) => p.text)
    .join('\n\n');
}

function patchLastAiMessage(messages, content) {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].role === 'ai') {
      next[i] = { ...next[i], content };
      return next;
    }
  }
  return next;
}

function truncateTts(text, maxLen = 450) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastEnd = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return lastEnd > 80 ? cut.slice(0, lastEnd + 1).trim() : cut.trim();
}

function waitForMediaReady(mediaEl, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!mediaEl) {
      reject(new Error('Media element missing'));
      return;
    }
    if (mediaEl.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Media load timeout'));
    }, timeoutMs);
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(mediaEl.error || new Error('Media load error')); };
    const cleanup = () => {
      clearTimeout(timer);
      mediaEl.removeEventListener('canplay', onReady);
      mediaEl.removeEventListener('error', onError);
    };
    mediaEl.addEventListener('canplay', onReady, { once: true });
    mediaEl.addEventListener('error', onError, { once: true });
    mediaEl.load();
  });
}

// ==================== MAIN LESSON SESSION ====================
export default function LessonSession() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const sessionStartRef = useRef(Date.now());
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [remainingTime, setRemainingTime] = useState(location.state?.remainingMinutes || 30);
  const [corrections, setCorrections] = useState([]);
  const [vocabulary, setVocabulary] = useState([]);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [mediaPhase, setMediaPhase] = useState('idle');
  const [voiceMode, setVoiceMode] = useState(true);
  const [speakyMuted, setSpeakyMuted] = useState(false);
  const [currentHint, setCurrentHint] = useState(null);
  const [hintsUsedTotal, setHintsUsedTotal] = useState(0);
  const [videoError, setVideoError] = useState(false);

  const messagesEndRef = useRef(null);
  const timerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);
  const introVideoRef = useRef(null);
  const idleVideoRef = useRef(null);
  const speakingVideoRef = useRef(null);
  const didAvatarRef = useRef(null);
  const wav2lipAvatarRef = useRef(null);
  const didReadyRef = useRef(false);
  const wav2lipReadyRef = useRef(false);
  const activeAvatarRef = useRef('three');
  const didConfig = useMemo(() => getDidConfig(), []);
  const wav2lipConfig = useMemo(() => getWav2lipConfig(), []);
  const [didReady, setDidReady] = useState(false);
  const [wav2lipReady, setWav2lipReady] = useState(false);
  const [activeAvatar, setActiveAvatar] = useState('three');
  const [backendOk, setBackendOk] = useState(null);
  const [didFailed, setDidFailed] = useState(false);
  const [wav2lipFailed, setWav2lipFailed] = useState(false);
  const useWav2lipAvatar = activeAvatar === 'wav2lip' && wav2lipReady;
  const useDidAttempt = activeAvatar === 'did' && didConfig.enabled && backendOk === true && !didFailed;
  const useWav2lipAttempt = activeAvatar === 'wav2lip' && wav2lipConfig.enabled && backendOk === true;
  const currentAudioUrlRef = useRef(null);
  const playbackGenRef = useRef(0);
  const audioUnlockedRef = useRef(false);
  const pendingSpeakRef = useRef(null);
  const pendingAudioUrlRef = useRef(null);
  const hasSentInitialRef = useRef(false);
  const sendTranscribedRef = useRef(null);
  const speakyMutedRef = useRef(false);
  const activeHintTurkishRef = useRef('');
  const hintRequestIdRef = useRef(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const scenario = location.state?.scenario;

  const isSpeaking = mediaPhase === 'speaking';
  const isPreparingVoice = mediaPhase === 'preparing';
  const isWaitingUser = mediaPhase === 'waiting';
  const isPausedBetween = mediaPhase === 'paused';
  const hasAiMessage = messages.some((m) => m.role === 'ai');
  const showAvatarVideo = sessionStarted && hasAiMessage && !videoError;
  const useDidAvatar = useDidAttempt && didReady;
  const showMp4Layers = showAvatarVideo && activeAvatar === 'mp4';
  const showThreeAvatar = showAvatarVideo && activeAvatar === 'three';
  const showMerhabaVideo = showMp4Layers && isSpeaking;
  const showIdleVideo =
    showMp4Layers && !isSpeaking && !isPreparingVoice && !isWaitingUser && !isPausedBetween;
  const showStaticWait =
    showAvatarVideo && (isWaitingUser || isPausedBetween) && !isSpeaking;

  const unlockAudioPlayback = async () => {
    const ok = await unlockAudioElement(audioRef.current);
    if (ok) {
      audioUnlockedRef.current = true;
      setNeedsAudioUnlock(false);
    }
    return ok;
  };

  const revokeAudioUrl = () => {
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
  };

  const isCancelled = (gen) => gen !== playbackGenRef.current;

  const speakOneSegment = async (seg, blobUrl, gen, onStartCb) => {
    const handleStart = () => {
      if (!isCancelled(gen)) setMediaPhase('speaking');
      if (onStartCb) onStartCb();
    };

    if (useWav2lipAvatar && wav2lipAvatarRef.current?.speakAndWait) {
      try {
        await wav2lipAvatarRef.current.speakAndWait(seg.text, seg.lang, {
          isCancelled: () => isCancelled(gen),
          onSpeakStart: handleStart,
          onSpeakEnd: () => {
            if (!isCancelled(gen)) setMediaPhase('paused');
          },
        });
        return;
      } catch (err) {
        console.warn('Wav2Lip basarisiz, TTS yedegi:', err);
        setWav2lipFailed(true);
        setActiveAvatar('three');
      }
    }
    if (useDidAvatar && didAvatarRef.current?.speakAndWait) {
      try {
        handleStart();
        await didAvatarRef.current.speakAndWait(seg.text, seg.lang);
        if (!isCancelled(gen)) setMediaPhase('paused');
        return;
      } catch (err) {
        console.warn('D-ID sesi basarisiz, TTS yedegi:', err);
      }
    }
    if (blobUrl) {
      await playAudioUrl(audioRef.current, blobUrl, {
        isCancelled: () => isCancelled(gen),
        onSpeakStart: handleStart,
        onSpeakEnd: () => {
          if (!isCancelled(gen)) setMediaPhase('paused');
        },
      });
      return;
    }
    handleStart();
    await speakWithBrowserTts(seg.text, seg.lang === 'en' ? 'en' : 'tr');
    if (!isCancelled(gen)) setMediaPhase('paused');
  };

  /** Tek merkez: mesaj ekranda → TTS/D-ID → cevap beklenir */
  const runAiTurn = useCallback(
    async (apiData, applyMessages, { skipReveal = false } = {}) => {
      const gen = ++playbackGenRef.current;
      const text = apiData?.response || '';
      const ttsSegments = apiData?.tts_segments;

      const segments = expandSegmentsToSentences(
        (ttsSegments?.length ? ttsSegments : inferTtsSegments(text)).filter((s) => s?.text?.trim())
      );
      const speakSegments = segmentsBeforeUserAnswer(text, segments);
      const progressiveReveal = !skipReveal && speakSegments.length > 1;

      if (!skipReveal) {
        flushSync(() => setMessages((prev) => patchLastAiMessage(applyMessages(prev), '...')));
        processStructuredResponse(apiData);
        setIsLoading(false);
        setMediaPhase('text');
        await waitAfterMessageReveal(() =>
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        );
        if (isCancelled(gen)) return;
      }

      if (speakyMutedRef.current || !text.trim()) {
        setMediaPhase('waiting');
        return;
      }

      if (!speakSegments.length) {
        if (!skipReveal) {
          flushSync(() => setMessages((prev) => patchLastAiMessage(prev, text)));
        }
        setMediaPhase('waiting');
        return;
      }

      pendingSpeakRef.current = { text, ttsSegments };
      setMediaPhase('preparing');

      const fetchSegmentAudio = async (seg) => {
        const res = await speakText(
          truncateTts(seg.text),
          seg.lang === 'en' ? 'en' : 'tr'
        );
        return res.data;
      };

      const useLipSyncPlayback =
        (activeAvatarRef.current === 'wav2lip' && wav2lipReadyRef.current) ||
        (activeAvatarRef.current === 'did' && didReadyRef.current);
      const ttsPrefetch =
        activeAvatarRef.current === 'wav2lip'
          ? Promise.resolve(speakSegments.map(() => null))
          : prefetchTtsBlobs(speakSegments, fetchSegmentAudio, {
              isCancelled: () => isCancelled(gen),
            });

      if (!audioUnlockedRef.current && !useLipSyncPlayback) {
        setNeedsAudioUnlock(true);
        try {
          const res = await speakText(
            truncateTts(speakSegments[0].text),
            speakSegments[0].lang === 'en' ? 'en' : 'tr'
          );
          if (res.data?.audio && !isCancelled(gen)) {
            const mime = res.data.format === 'wav' ? 'audio/wav' : 'audio/mpeg';
            pendingAudioUrlRef.current = URL.createObjectURL(
              base64ToBlob(res.data.audio, mime)
            );
          }
        } catch {
          /* unlock gerekli */
        }
        setMediaPhase('waiting');
        return;
      }

      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      revokeAudioUrl();
      pendingAudioUrlRef.current = null;

      const blobs = await ttsPrefetch;

      if (isCancelled(gen)) {
        blobs.forEach((u) => {
          if (u) URL.revokeObjectURL(u);
        });
        return;
      }

      const finishTurn = () => {
        if (isCancelled(gen)) return;
        if (!skipReveal) {
          flushSync(() => setMessages((prev) => patchLastAiMessage(prev, text)));
        }
        setMediaPhase('waiting');
        pendingSpeakRef.current = null;
      };

      const segmentCount = speakSegments.length;

      try {
        for (let i = 0; i < segmentCount; i++) {
          if (isCancelled(gen)) break;
          if (i > 0) {
            setMediaPhase('paused');
            if (!progressiveReveal) {
              await new Promise((r) => setTimeout(r, BETWEEN_SENTENCE_MS));
            }
          }
          
          const onStartCb = () => {
            if (skipReveal) return;
            if (progressiveReveal) {
              flushSync(() =>
                setMessages((prev) =>
                  patchLastAiMessage(prev, cumulativeSentenceText(speakSegments, i))
                )
              );
            } else if (i === 0) {
              flushSync(() =>
                setMessages((prev) => patchLastAiMessage(prev, text))
              );
            }
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          };

          await speakOneSegment(speakSegments[i], blobs[i] || null, gen, onStartCb);
          if (blobs[i]) URL.revokeObjectURL(blobs[i]);
          if (pendingAudioUrlRef.current) break;
        }
      } catch (err) {
        if (err?.name === 'NotAllowedError') {
          audioUnlockedRef.current = false;
          setNeedsAudioUnlock(true);
        }
      } finally {
        if (!isCancelled(gen) && !pendingAudioUrlRef.current) {
          finishTurn();
        } else if (!pendingAudioUrlRef.current) {
          pendingSpeakRef.current = null;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- processStructuredResponse stable
    []
  );

  const resumePendingAudio = async () => {
    const url = pendingAudioUrlRef.current;
    const audio = audioRef.current;
    if (!audio || !url) return false;
    audioUnlockedRef.current = true;
    setNeedsAudioUnlock(false);
    const gen = ++playbackGenRef.current;
    try {
      await playAudioUrl(audio, url, {
        isCancelled: () => isCancelled(gen),
        onSpeakStart: () => setMediaPhase('speaking'),
        onSpeakEnd: () => setMediaPhase('paused'),
      });
      pendingAudioUrlRef.current = null;
      setMediaPhase('waiting');
      return true;
    } catch {
      return false;
    }
  };

  const handleSesiAcClick = async () => {
    if (await resumePendingAudio()) {
      toast.success('Ses acildi');
      return;
    }
    const pending = pendingSpeakRef.current;
    const lastAi = [...messages].reverse().find((m) => m.role === 'ai');
    const text = pending?.text || lastAi?.content;
    const ttsSegments = pending?.ttsSegments ?? lastAi?.tts_segments;
    if (!text?.trim()) {
      toast.error('Oynatilacak mesaj bulunamadi');
      return;
    }
    const ok = await unlockAudioPlayback();
    if (!ok) {
      toast.error('Ses acilamadi');
      setNeedsAudioUnlock(true);
      return;
    }
    pendingSpeakRef.current = null;
    await runAiTurn(
      { response: text, tts_segments: ttsSegments },
      () => {},
      { skipReveal: true }
    );
  };

  const startLesson = async () => {
    const aiUp = await checkAiBackend();
    setBackendOk(aiUp);
    if (!aiUp) {
      toast.error(
        'AI sunucusu calismiyor. Terminal: cd backend && uvicorn ai_server:app --reload --port 8001',
        { duration: 8000 }
      );
      return;
    }
    const ok = await unlockAudioPlayback();
    setSessionStarted(true);
    setVideoError(false);
    setMediaPhase('thinking');
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        toast.info('Mikrofon izni ders sirasinda istenecek.', { duration: 3000 });
      }
    }
    if (!ok) {
      toast.error('Ses acilamadi. Tekrar deneyin veya Sesi Ac butonunu kullanin.');
    }
    if (!hasSentInitialRef.current) {
      hasSentInitialRef.current = true;
      if (useDidAttempt) {
        for (let i = 0; i < 25 && !didReadyRef.current && !didFailed; i += 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      await sendInitialMessage();
      return;
    }
    handleSesiAcClick();
  };

  const ensureAudioUnlocked = async () => {
    if (audioUnlockedRef.current) return true;
    return unlockAudioPlayback();
  };

  const cancelPlayback = () => {
    playbackGenRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
    }
    revokeAudioUrl();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setMediaPhase('idle');
  };

  useEffect(() => {
    if (!sessionStarted || videoError) return;
    const idle = idleVideoRef.current;
    const speaking = speakingVideoRef.current;
    const intro = introVideoRef.current;
    if (!idle || !speaking) return;

    [idle, speaking, intro].forEach((v) => {
      if (!v) return;
      v.muted = true;
      v.playsInline = true;
      if (v !== intro) v.loop = true;
    });

    if (
      !showAvatarVideo ||
      mediaPhase === 'thinking' ||
      mediaPhase === 'preparing' ||
      mediaPhase === 'waiting' ||
      mediaPhase === 'paused'
    ) {
      [idle, speaking, intro].forEach((v) => v?.pause());
      return;
    }

    if (mediaPhase === 'speaking') {
      if (intro) {
        intro.loop = true;
        intro.muted = true;
        intro.volume = 0;
        if (intro.paused) {
          try {
            intro.currentTime = 0;
          } catch {
            /* ignore */
          }
          intro.play().catch(() => {});
        }
      }
      idle.pause();
      speaking.pause();
      return;
    }
    if (intro) {
      intro.pause();
      intro.loop = false;
      try {
        intro.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    speaking.pause();
    try {
      speaking.currentTime = 0;
    } catch {
      /* ignore */
    }
    idle.play().catch(() => {});
  }, [mediaPhase, sessionStarted, videoError, showAvatarVideo]);

  useEffect(() => {
    [introVideoRef, idleVideoRef, speakingVideoRef].forEach((ref) => {
      ref.current?.load();
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    checkAiBackend().then((ok) => {
      if (!cancelled) setBackendOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    activeAvatarRef.current = activeAvatar;
  }, [activeAvatar]);

  useEffect(() => {
    if (backendOk !== true) return undefined;
    setActiveAvatar('three');
  }, [backendOk]);

  const requestHint = async (turkishSentence) => {
    if (!turkishSentence?.trim()) return;
    const normalized = turkishSentence.trim();
    activeHintTurkishRef.current = normalized;
    const requestId = ++hintRequestIdRef.current;

    setCurrentHint({ turkish: normalized, english: '', loading: true });

    try {
      const response = await axios.post(
        `${getAiApiBase()}/hint/translate`,
        { turkish_sentence: normalized, level: scenario?.level || 'A1' },
        { headers: await getAuthHeaders() }
      );
      if (requestId !== hintRequestIdRef.current) return;
      if (activeHintTurkishRef.current !== normalized) return;

      if (response.data.success && response.data.translation) {
        setCurrentHint({
          turkish: normalized,
          english: response.data.translation.trim(),
          loading: false,
        });
      } else {
        setCurrentHint(null);
      }
    } catch (error) {
      console.error('Hint request failed:', error);
      if (requestId === hintRequestIdRef.current) {
        setCurrentHint({ turkish: normalized, english: '', loading: false });
      }
    }
  };

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 0) { clearInterval(timerRef.current); endSession(); return 0; }
        return prev - (1/60);
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // En son AI sorusu degisince adam asmacayi sifirla
  useEffect(() => {
    const lastAiMessage = [...messages].reverse().find((m) => m.role === 'ai');
    if (!lastAiMessage) {
      activeHintTurkishRef.current = '';
      hintRequestIdRef.current += 1;
      setCurrentHint(null);
      return;
    }

    const turkishSentence = extractChallengeTurkishSentence(lastAiMessage.content);
    if (!turkishSentence) {
      activeHintTurkishRef.current = '';
      hintRequestIdRef.current += 1;
      setCurrentHint(null);
      return;
    }

    const norm = turkishSentence.trim();
    if (norm === activeHintTurkishRef.current && currentHint?.english && !currentHint?.loading) {
      return;
    }

    requestHint(norm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const normalizeVocab = (v) => ({
    word: (v.word || v.english || '').trim(),
    meaning: (v.meaning || v.translation_tr || v.turkish || '').trim(),
    example: (v.example || v.english || v.word || '').trim(),
  });

  // Process structured data from API response
  const processStructuredResponse = (data) => {
    if (data.corrections?.length > 0) {
      const normalized = data.corrections.map((c) => ({
        original: c.original || '',
        correction: c.correction || c.corrected || '',
        explanation: c.explanation || c.explanation_tr || '',
        turkish: c.turkish || '',
      }));
      setCorrections((prev) => [...prev, ...normalized]);
    }
    if (data.vocabulary?.length > 0) {
      const normalized = data.vocabulary
        .map(normalizeVocab)
        .filter((v) => v.word || v.meaning);
      if (normalized.length) {
        setVocabulary((prev) => [...normalized, ...prev].slice(0, 10));
      }
    }
  };

  useEffect(() => {
    speakyMutedRef.current = speakyMuted;
  }, [speakyMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 1;
    audio.muted = false;
  }, [sessionStarted]);

  const sendInitialMessage = async () => {
    setIsLoading(true);
    setMediaPhase('thinking');
    try {
      const response = await axios.post(
        `${getAiApiBase()}/chat`,
        { message: 'Merhaba, pratige hazirim!', session_id: sessionId },
        { headers: await getAuthHeaders() }
      );

      await runAiTurn(
        response.data,
        () => [
          { role: 'user', content: 'Merhaba, pratige hazirim!' },
          {
            role: 'ai',
            content: response.data.response,
            tts_segments: response.data.tts_segments,
          },
        ],
      );
    } catch (error) {
      const msg =
        error?.code === 'ERR_NETWORK' || error?.message?.includes('Network')
          ? 'AI sunucusuna ulasilamadi (port 8001 acik mi?)'
          : 'Speaky ile baglanti kurulamadi';
      toast.error(msg, { duration: 6000 });
      console.error(error);
      setIsLoading(false);
      setMediaPhase('idle');
    }
  };

  const recognitionRef = useRef(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        transcript = transcript.trim();
        if (transcript && sendTranscribedRef.current) {
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          sendTranscribedRef.current(transcript);
        }
      };

      rec.onend = () => setIsRecording(false);

      rec.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
        if (event.error === 'not-allowed') {
          toast.error('Mikrofon izni gerekli. Adres cubugundaki kilit ikonundan izin verin.');
        } else if (event.error === 'no-speech') {
          toast.info('Ses algilanmadi. Ingilizce konusup tekrar deneyin.');
        } else if (event.error !== 'aborted') {
          toast.error('Mikrofon hatasi: ' + event.error);
        }
      };

      recognitionRef.current = rec;
    }
  }, []);

  const ensureMicPermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Bu tarayici mikrofonu desteklemiyor.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      toast.error('Mikrofon izni gerekli. Chrome veya Edge kullanin.');
      return false;
    }
  };

  const startRecording = async () => {
    if (!recognitionRef.current) {
      toast.error('Ses tanima desteklenmiyor. Chrome veya Edge kullanin.');
      return;
    }
    const micOk = await ensureMicPermission();
    if (!micOk) return;
    try {
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.start();
      setIsRecording(true);
      toast.info('Ingilizce konusun — bitince otomatik gonderilir', { duration: 2500 });
    } catch (error) {
      if (error?.message?.includes('already started')) {
        recognitionRef.current.stop();
        setTimeout(() => startRecording(), 300);
        return;
      }
      console.error('Mikrofon baslatilamadi:', error);
      toast.error('Mikrofon acilamadi');
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = async () => {
    await ensureAudioUnlocked();
    isRecording ? stopRecording() : startRecording();
  };

  const handleReplayMessage = async (content, ttsSegments) => {
    await ensureAudioUnlocked();
    cancelPlayback();
    await runAiTurn(
      { response: content, tts_segments: ttsSegments },
      () => {},
      { skipReveal: true }
    );
  };

  const sendTranscribedMessage = async (user_text) => {
    if (!user_text?.trim() || isLoading) return;
    cancelPlayback();
    flushSync(() => {
      setMessages((prev) => [...prev, { role: 'user', content: user_text, voice: true }]);
    });
    setIsLoading(true);
    setMediaPhase('thinking');
    try {
      const response = await axios.post(
        `${getAiApiBase()}/chat`,
        { session_id: sessionId, message: user_text },
        { headers: await getAuthHeaders() }
      );

      await runAiTurn(
        response.data,
        (prev) => [
          ...prev,
          {
            role: 'ai',
            content: response.data.response,
            tts_segments: response.data.tts_segments,
          },
        ]
      );
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Mesaj gonderilemedi');
      setIsLoading(false);
      setMediaPhase('idle');
    }
  };

  useEffect(() => {
    sendTranscribedRef.current = sendTranscribedMessage;
  });

  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || isLoading) return;
    await ensureAudioUnlocked();
    const userMessage = inputText.trim();
    setInputText('');
    cancelPlayback();
    flushSync(() => {
      setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    });
    setIsLoading(true);
    setMediaPhase('thinking');
    try {
      const response = await axios.post(
        `${getAiApiBase()}/chat`,
        { message: userMessage, session_id: sessionId },
        { headers: await getAuthHeaders() }
      );
      await runAiTurn(
        response.data,
        (prev) => [
          ...prev,
          {
            role: 'ai',
            content: response.data.response,
            tts_segments: response.data.tts_segments,
          },
        ]
      );
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Mesaj gonderilemedi');
      setIsLoading(false);
      setMediaPhase('idle');
    }
  };

  const endSession = async () => {
    if (sessionEnded) return;
    setSessionEnded(true);
    try {
      const durationMinutes = (Date.now() - sessionStartRef.current) / 60000;
      if (user?.id) await endLesson(user.id, sessionId, durationMinutes);
      await refreshUser();
      toast.success('Oturum tamamlandi!');
    } catch (error) {
      console.error('Failed to end session:', error);
    }
  };

  const handleEndSession = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await endSession();
    navigate('/');
  };

  const formatTime = (minutes) => {
    if (minutes >= 60) return `${Math.floor(minutes)} dk`;
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen relative">
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        onEnded={revokeAudioUrl}
        onError={() => {
          revokeAudioUrl();
          setMediaPhase('idle');
        }}
      />

      {/* Background */}
      <div className="page-background">
        <img src="https://images.unsplash.com/photo-1760112783563-514867b4c2ed?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDN8MHwxfHNlYXJjaHwzfHxhYnN0cmFjdCUyMGRhcmslMjBncmVlbiUyMGJsdWUlMjB3YXZlc3xlbnwwfHx8fDE3NzU0NTY2MzV8MA&ixlib=rb-4.1.0&q=85" alt="Background" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-header">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button onClick={handleEndSession}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors" data-testid="back-btn">
              <ArrowLeft className="w-5 h-5" /><span>Oturumu Bitir</span>
            </button>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSpeakyMuted((m) => !m)}
                className={`p-2 rounded-full transition-all ${speakyMuted ? 'bg-slate-800 text-slate-400' : 'bg-indigo-600 text-white'}`}
                data-testid="voice-mode-toggle"
                title={speakyMuted ? 'Speaky sesi kapali' : 'Speaky sesi acik'}
              >
                {speakyMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <div className="flex items-center gap-2 glass px-4 py-2">
                <Clock className={`w-5 h-5 ${remainingTime < 5 ? 'text-red-400' : 'text-indigo-400'}`} />
                <span className={`font-mono font-medium ${remainingTime < 5 ? 'text-red-400' : 'text-white'}`}>
                  {formatTime(remainingTime)}
                </span>
              </div>
            </div>
            {scenario && (
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-400">{scenario.level}</span>
                <span className="text-sm text-slate-300">{scenario.title_tr}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
          
          {/* LEFT SIDE: Video & Modules (lg:col-span-2) */}
          <div className="lg:col-span-2 flex flex-col gap-4">
             {/* Main AI Video/Image Area (Red Box) */}
             <div className="flex-1 glass rounded-3xl flex flex-col items-center justify-center relative overflow-hidden min-h-[400px]">
                <div className="absolute inset-0 bg-indigo-500/5 z-10 pointer-events-none"></div>
                <>
                  {useWav2lipAttempt && sessionStarted && (
                    <div
                      className={`absolute inset-0 z-20 transition-opacity duration-300 ${
                        useWav2lipAvatar ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <Wav2LipAvatar
                        ref={wav2lipAvatarRef}
                        audioRef={audioRef}
                        active={useWav2lipAttempt && !wav2lipFailed}
                        idleVideoUrl={wav2lipConfig.faceVideoUrl}
                        onSpeakStart={() => setMediaPhase('speaking')}
                        onSpeakEnd={() => setMediaPhase('paused')}
                        onReady={() => {
                          wav2lipReadyRef.current = true;
                          setWav2lipReady(true);
                        }}
                        onFailed={() => {
                          wav2lipReadyRef.current = false;
                          setWav2lipReady(false);
                          setWav2lipFailed(true);
                          setActiveAvatar('three');
                        }}
                      />
                    </div>
                  )}
                  {!isWav2lipOnly() && useDidAttempt && sessionStarted && (
                    <div
                      className={`absolute inset-0 z-20 transition-opacity duration-300 ${
                        useDidAvatar ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      <DIDAvatar
                        ref={didAvatarRef}
                        active={useDidAttempt}
                        apiKey={didConfig.apiKey}
                        sourceUrl={didConfig.sourceUrl}
                        useProxy={didConfig.useProxy}
                        onReady={() => {
                          didReadyRef.current = true;
                          setDidReady(true);
                        }}
                        onFailed={() => {
                          didReadyRef.current = false;
                          setDidReady(false);
                          setDidFailed(true);
                          setActiveAvatar('three');
                        }}
                      />
                    </div>
                  )}
                  <ThreeAvatar 
                    active={showThreeAvatar}
                    audioRef={audioRef}
                    isTalking={isSpeaking}
                    className={`absolute inset-0 z-20 transition-opacity duration-300 ${showThreeAvatar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                  />
                  <video
                    ref={introVideoRef}
                    src={LESSON_VIDEOS.welcome}
                    className={`absolute inset-0 w-full h-full object-cover z-[15] transition-opacity duration-200 ${
                      showMerhabaVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                    playsInline
                    muted
                    preload="auto"
                  />
                  <video
                    ref={idleVideoRef}
                    src={LESSON_VIDEOS.idle}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${
                      !showIdleVideo ? 'opacity-0' : 'opacity-100'
                    }`}
                    loop
                    muted
                    playsInline
                    preload="auto"
                    onError={() => {
                      console.error('Idle video yuklenemedi');
                      setVideoError(true);
                    }}
                  />
                  <video
                    ref={speakingVideoRef}
                    src={LESSON_VIDEOS.speaking}
                    className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
                    loop
                    muted
                    playsInline
                    preload="auto"
                    aria-hidden
                  />
                  {videoError && sessionStarted && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/80">
                      <SpeakyCharacter size="lg" isTalking={isSpeaking} />
                      <p className="text-sm text-slate-400 mt-4">Video yuklenemedi — sesli ders devam ediyor</p>
                    </div>
                  )}
                  {sessionStarted && !showAvatarVideo && !videoError && (
                    <div className="absolute inset-0 z-[12] flex flex-col items-center justify-center bg-slate-900/70">
                      <SpeakyCharacter size="lg" isTalking={isLoading || isPreparingVoice} />
                    </div>
                  )}
                  {showStaticWait && (
                    <div className="absolute inset-0 z-[12] flex flex-col items-center justify-center bg-slate-900/50">
                      <SpeakyCharacter size="lg" isTalking={false} />
                    </div>
                  )}
                </>

                {!sessionStarted && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-6">
                    <SpeakyCharacter size="md" />
                    <h2 className="text-xl font-heading text-white mt-4 mb-2">Derse hazir misin?</h2>
                    <p className="text-sm text-slate-300 text-center max-w-sm mb-6">
                      Tarayici kurallari icin once dokunman gerekiyor; sonra Speaky konusmaya baslar.
                    </p>
                    <Button
                      onClick={startLesson}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-6 text-lg rounded-2xl shadow-lg shadow-indigo-600/30"
                      data-testid="start-lesson-btn"
                    >
                      <Sparkles className="w-5 h-5 mr-2" />
                      Derse Basla
                    </Button>
                  </div>
                )}

                {sessionStarted && needsAudioUnlock && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 animate-pulse">
                    <Button
                      onClick={handleSesiAcClick}
                      size="lg"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 px-6"
                      data-testid="unlock-audio-btn"
                    >
                      <Volume2 className="w-5 h-5 mr-2" />
                      Speaky&apos;yi Dinle (ses icin tikla)
                    </Button>
                  </div>
                )}
                
                <div className="absolute bottom-8 left-0 right-0 z-20 flex justify-center">
                  <div className="bg-black/40 backdrop-blur-md px-6 py-2.5 rounded-full border border-white/10 shadow-lg shadow-black/20">
                    <p className="text-center text-sm font-medium text-white flex items-center gap-2">
                      {isRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                      {(isLoading || isPreparingVoice) && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
                      {isSpeaking && <Volume2 className="w-4 h-4 text-emerald-400" />}
                      {isRecording ? 'Dinliyorum... Durdurmak icin tikla' 
                        : isLoading ? 'Speaky dusunuyor...'
                        : isPreparingVoice ? 'Ses hazirlaniyor...'
                        : isSpeaking ? 'Speaky konusuyor...'
                        : isWaitingUser
                          ? 'Siradaki cumleyi Ingilizce konus'
                          : voiceMode
                            ? 'Mikrofona tikla ve konus'
                            : 'Cevirini yaz'}
                    </p>
                  </div>
                </div>
             </div>

             {/* Bottom Modules */}
             <div className="flex flex-col gap-4 shrink-0">
                {/* Kopya — üstte tam genişlik */}
                <div className="glass rounded-2xl p-3 overflow-hidden border border-amber-500/20 hover:border-amber-500/40 transition-colors min-h-[100px]">
                  {currentHint ? (
                    <HintHelper
                      key={currentHint.turkish}
                      variant="wide"
                      sentence={currentHint.english}
                      turkishPreview={currentHint.turkish}
                      loading={currentHint.loading}
                      onHintUsed={() => setHintsUsedTotal((prev) => prev + 1)}
                    />
                  ) : (
                    <div className="flex items-center justify-center gap-4 py-6 px-4">
                      <Lightbulb className="w-6 h-6 text-amber-500/50 shrink-0" />
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">
                          Kopya Modülü
                        </span>
                        <p className="text-slate-500 text-xs">İpucu beklenebilir</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Alt sıra: 3 kutucuk */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-h-[200px] h-[min(260px,28vh)]">
                {/* Kelimeler */}
                <div className="glass rounded-2xl p-4 overflow-hidden flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 text-center shrink-0">Kelimeler</span>
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {vocabulary.length > 0 ? (
                      <AnimatePresence mode="sync">
                        {vocabulary.map((v, i) => (
                          <VocabularyCard key={`${v.word}-${i}`} vocab={v} />
                        ))}
                      </AnimatePresence>
                    ) : (
                      <p className="text-slate-500 text-xs text-center mt-4">Henuz kelime yok</p>
                    )}
                  </div>
                </div>

                {/* Module 3: Düzeltmeler */}
                <div className="glass rounded-2xl p-4 overflow-hidden flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 text-center shrink-0">Duzeltmeler</span>
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {corrections.length > 0 ? (
                      <AnimatePresence mode="sync">
                        {corrections.slice().reverse().map((correction, i) => (
                          <CorrectionCard key={`c-${i}`} correction={correction} />
                        ))}
                      </AnimatePresence>
                    ) : (
                      <p className="text-slate-500 text-xs text-center mt-4">Henuz duzeltme yok</p>
                    )}
                  </div>
                </div>

                {/* Module 4: Oturum Bilgisi */}
                <div className="glass rounded-2xl p-4 overflow-hidden flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 text-center shrink-0">Oturum Bilgisi</span>
                  <div className="flex-1 overflow-y-auto text-xs space-y-3 text-slate-300 px-1">
                    <div className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span className="text-slate-500 font-medium">Seviye</span><span className="text-indigo-400 font-bold">{scenario?.level || 'A1'}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span className="text-slate-500 font-medium">Mesaj</span><span className="font-bold">{messages.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span className="text-slate-500 font-medium">Kelime</span><span className="text-indigo-400 font-bold">{vocabulary.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span className="text-slate-500 font-medium">Duzeltme</span><span className="text-red-400 font-bold">{corrections.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Ipucu</span><span className="text-amber-400 font-bold">{hintsUsedTotal}</span>
                    </div>
                  </div>
                </div>
                </div>
             </div>
          </div>

          {/* RIGHT SIDE: Chat Area (lg:col-span-1) */}
          <div className="lg:col-span-1 glass flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-white/10 bg-white/[0.02] shrink-0">
               <h3 className="text-slate-200 font-display font-bold text-sm flex items-center gap-2 tracking-wide">
                 <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                 SOHBET
               </h3>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, index) => (
                  <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.role === 'ai' && (
                      <span className="text-[10px] text-slate-500 ml-1 mb-1 font-bold uppercase tracking-wider">Speaky</span>
                    )}
                    <div className={`p-3 rounded-2xl max-w-[85%] ${
                      msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-800/80 text-slate-200 rounded-bl-sm border border-white/5'}`}>
                      {msg.voice && <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded mr-1 inline-block align-middle">Sesli</span>}
                      <span className="text-sm whitespace-pre-wrap leading-relaxed inline-block align-middle">{msg.content}</span>
                      
                      {msg.role === 'ai' && (
                        <div className="mt-2 flex justify-end">
                          <button onClick={() => handleReplayMessage(msg.content, msg.tts_segments)} disabled={isSpeaking || isPreparingVoice}
                            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-indigo-400 transition-colors">
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                
                {isLoading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                    <div className="bg-slate-800/80 border border-white/5 p-4 rounded-2xl rounded-bl-sm">
                      <div className="flex gap-1.5">
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area inside Chat */}
            <div className="p-4 border-t border-white/10 bg-slate-900/50">
              {voiceMode ? (
                <div className="flex flex-col items-center justify-center py-2">
                  <button onClick={toggleRecording} disabled={isLoading || isPreparingVoice || isSpeaking || sessionEnded}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl
                      ${isRecording ? 'bg-red-500 animate-pulse scale-105 shadow-red-500/50' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'}
                      ${(isLoading || isPreparingVoice || isSpeaking || sessionEnded) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    data-testid="mic-btn">
                    {isLoading ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                      : isRecording ? <MicOff className="w-5 h-5 text-white" />
                      : <Mic className="w-5 h-5 text-white" />}
                  </button>
                  <p className="text-xs text-slate-400 mt-3">{isRecording ? 'Kaydi durdur' : 'Konusmak icin tikla'}</p>
                </div>
              ) : (
                <form onSubmit={sendMessage} className="flex gap-2">
                  <Input value={inputText} onChange={(e) => setInputText(e.target.value)}
                    placeholder="Mesajini yaz..." className="flex-1 bg-black/40 border-white/10 text-white rounded-xl text-sm"
                    disabled={isLoading || sessionEnded} data-testid="chat-input" />
                  <Button type="submit" disabled={!inputText.trim() || isLoading || sessionEnded}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4" data-testid="send-btn">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              )}
              <div className="flex justify-center mt-3">
                <button
                  onClick={() => {
                    if (voiceMode && isRecording) {
                      stopRecording();
                    }
                    setVoiceMode(!voiceMode);
                  }}
                  className="text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:text-indigo-400 transition-colors">
                  {voiceMode ? 'Yazarak devam et' : 'Konusarak devam et'}
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Session Ended */}
      <AnimatePresence>
        {sessionEnded && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="glass p-8 max-w-md text-center">
              <SpeakyCharacter size="lg" />
              <h2 className="text-2xl font-heading font-medium text-white mb-2 mt-4">Harika Is Cikardin!</h2>
              <div className="grid grid-cols-3 gap-4 my-6">
                <div className="glass p-3">
                  <p className="text-xl font-bold text-indigo-400">{vocabulary.length}</p>
                  <p className="text-[10px] text-slate-400">Kelime</p>
                </div>
                <div className="glass p-3">
                  <p className="text-xl font-bold text-red-400">{corrections.length}</p>
                  <p className="text-[10px] text-slate-400">Duzeltme</p>
                </div>
                <div className="glass p-3">
                  <p className="text-xl font-bold text-emerald-400">{messages.length}</p>
                  <p className="text-[10px] text-slate-400">Mesaj</p>
                </div>
              </div>
              <p className="text-slate-400 mb-6">Yarin yine beklerim!</p>
              <Button onClick={() => navigate('/')} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full px-8"
                data-testid="return-home-btn">
                Ana Sayfaya Don
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
