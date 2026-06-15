import React, { useRef, useEffect, useState } from 'react';
import { TalkingHead } from '@met4citizen/talkinghead';

export default function ThreeAvatar({ active, audioRef, isTalking, className = '' }) {
  const containerRef = useRef(null);
  const headRef = useRef(null);
  const analyserRef = useRef(null);
  const requestRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  const avatarUrl = "/julia.glb";

  // Initialize TalkingHead
  useEffect(() => {
    if (!active || !containerRef.current) return;

    let head = null;

    const init = async () => {
      try {
        // Instantiate TalkingHead with preferred camera view
        head = new TalkingHead(containerRef.current, {
          cameraView: 'upper',
          cameraRotateEnable: false,
          cameraPanEnable: false,
          cameraZoomEnable: false,
          lipsyncModules: [], // Disable internal lipsync modules to fix Webpack import error
        });

        headRef.current = head;

        // Show avatar
        await head.showAvatar({
          url: avatarUrl,
          body: 'F', // Assume female for the default model
          avatarMood: 'neutral'
        });

        // Start the animation loop
        head.start();
        setIsReady(true);
      } catch (err) {
        console.error("TalkingHead initialization failed:", err);
      }
    };

    init();

    return () => {
      setIsReady(false);
      if (head) {
        head.stop();
        headRef.current = null;
      }
    };
  }, [active, avatarUrl]);

  // Audio Analyser for Lip Sync
  useEffect(() => {
    if (!active || !audioRef?.current) return;

    try {
      // Re-use existing AudioContext and Analyser attached to the audio element
      if (!audioRef.current._audioContext) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 64;

        const source = audioContext.createMediaElementSource(audioRef.current);
        source.connect(analyserNode);
        analyserNode.connect(audioContext.destination);

        audioRef.current._audioContext = audioContext;
        audioRef.current._analyserNode = analyserNode;
      }

      analyserRef.current = audioRef.current._analyserNode;
    } catch (err) {
      console.warn("AudioContext init failed:", err);
    }
    
    // Safely resume AudioContext when audio actually plays (fixes Chrome suspension block)
    const handlePlay = () => {
      if (audioRef.current && audioRef.current._audioContext && audioRef.current._audioContext.state === 'suspended') {
        audioRef.current._audioContext.resume().catch(e => console.warn("Failed to resume AudioContext", e));
      }
    };
    
    const audioEl = audioRef.current;
    if (audioEl) {
      audioEl.addEventListener('play', handlePlay);
      audioEl.addEventListener('playing', handlePlay);
    }

    return () => {
      if (audioEl) {
        audioEl.removeEventListener('play', handlePlay);
        audioEl.removeEventListener('playing', handlePlay);
      }
    };
  }, [active, audioRef]);

  // Render loop: drive lip sync through TalkingHead's own mtAvatar.realtime API
  useEffect(() => {
    if (!isReady || !headRef.current) return;

    const head = headRef.current;
    
    // The viseme blendshapes used for speech animation
    const speechVisemes = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U'];
    // Fallback targets if no viseme_* blendshapes exist
    const fallbackTargets = ['jawOpen', 'mouthOpen'];

    // Determine which blendshapes are available in the avatar
    const availableVisemes = speechVisemes.filter(v => head.mtAvatar && head.mtAvatar[v]);
    const availableFallbacks = fallbackTargets.filter(v => head.mtAvatar && head.mtAvatar[v]);
    
    console.log('[LipSync] Available visemes:', availableVisemes);
    console.log('[LipSync] Available fallbacks:', availableFallbacks);
    console.log('[LipSync] mtAvatar keys (sample):', head.mtAvatar ? Object.keys(head.mtAvatar).slice(0, 20) : 'N/A');

    const loop = () => {
      // Lazy init AudioContext if missing
      if (!analyserRef.current && audioRef?.current) {
        try {
          if (!audioRef.current._audioContext) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 64;
            const source = audioContext.createMediaElementSource(audioRef.current);
            source.connect(analyserNode);
            analyserNode.connect(audioContext.destination);
            audioRef.current._audioContext = audioContext;
            audioRef.current._analyserNode = analyserNode;
          }
          analyserRef.current = audioRef.current._analyserNode;
        } catch (e) {
          // ignore
        }
      }

      if (!head || !head.mtAvatar) {
        requestRef.current = requestAnimationFrame(loop);
        return;
      }

      // Calculate audio volume
      let volume = 0;
      const audioPlaying = audioRef?.current && !audioRef.current.paused && isTalking;

      if (audioPlaying && analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        volume = sum / dataArray.length;
      }

      // If Web Audio API fails but we're talking, simulate movement
      if (audioPlaying && volume === 0) {
        const t = Date.now() / 1000;
        const envelope = (Math.sin(t * 3) + 1) / 2;
        const jaw = (Math.sin(t * 20) + 1) / 2;
        volume = jaw * envelope * 20 + 5;
      }

      const intensity = Math.min(volume / 20, 1.0);

      // USE TALKINGHEAD'S NATIVE API: set .realtime + .needsUpdate on mtAvatar entries
      // This is the ONLY correct way - TalkingHead processes these in updateMorphTargets()
      // The priority order is: fixed > realtime > system > animation > baseline
      // By setting .realtime, we override animations without fighting the engine

      if (audioPlaying && intensity > 0.02) {
        const time = Date.now();
        const visemeIndex = Math.floor(time / 120) % availableVisemes.length;

        if (availableVisemes.length > 0) {
          // Set viseme blendshapes through TalkingHead's realtime API
          availableVisemes.forEach((v, idx) => {
            const mt = head.mtAvatar[v];
            if (mt) {
              mt.realtime = (idx === visemeIndex) ? intensity : intensity * 0.1;
              mt.needsUpdate = true;
            }
          });
        } else if (availableFallbacks.length > 0) {
          // Use jawOpen/mouthOpen as fallback
          availableFallbacks.forEach(fb => {
            const mt = head.mtAvatar[fb];
            if (mt) {
              mt.realtime = intensity;
              mt.needsUpdate = true;
            }
          });
        }
      } else {
        // Not talking: clear realtime values so TalkingHead returns to baseline
        [...availableVisemes, ...availableFallbacks].forEach(v => {
          const mt = head.mtAvatar?.[v];
          if (mt && mt.realtime !== null) {
            mt.realtime = null;
            mt.needsUpdate = true;
          }
        });
      }
      
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      // Clean up: clear all realtime values
      [...speechVisemes, ...fallbackTargets].forEach(v => {
        const mt = head?.mtAvatar?.[v];
        if (mt) {
          mt.realtime = null;
          mt.needsUpdate = true;
        }
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  if (!active) return null;

  return (
    <div className={`absolute inset-0 w-full h-full bg-slate-900 ${className}`} style={{ zIndex: 20 }}>
      {/* TalkingHead mounts its Canvas inside this container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Fallback loading indicator / decorative UI overlay */}
      <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-black/30 rounded-full backdrop-blur-sm pointer-events-none text-white/70 text-xs">
        <div className={`w-2 h-2 rounded-full ${isTalking ? 'bg-green-400 animate-pulse' : 'bg-slate-400'}`}></div>
        <span>3D Avatar {isTalking ? 'Konuşuyor' : 'Hazır'}</span>
      </div>
    </div>
  );
}
