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

  // Render loop to sync audio volume to jawOpen blendshape
  useEffect(() => {
    if (!isReady || !headRef.current) return;

    const head = headRef.current;
    
    // Common speech visemes for RPM / TalkingHead
    const speechVisemes = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U'];
    
    // Check if the avatar has jawOpen or mouthOpen as fallback
    let fallbackBlendshape = null;
    if (head.mtAvatar && head.mtAvatar['jawOpen']) {
      fallbackBlendshape = 'jawOpen';
    } else if (head.mtAvatar && head.mtAvatar['mouthOpen']) {
      fallbackBlendshape = 'mouthOpen';
    }

    const loop = () => {
      if (analyserRef.current && head.mtAvatar) {
        let volume = 0;

        if (audioRef.current && !audioRef.current.paused && isTalking) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for(let i=0; i<dataArray.length; i++) {
             sum += dataArray[i];
          }
          volume = sum / dataArray.length;

          // If Web Audio API fails (e.g. Safari restrictions), simulate smooth lip movement
          if (volume === 0) {
            const t = Date.now() / 1000;
            const envelope = (Math.sin(t * 3) + 1) / 2; // Pause occasionally
            const jaw = (Math.sin(t * 20) + 1) / 2;     // Rapid jaw movement
            volume = jaw * envelope * 20 + 5; 
          }
        }

        // Map volume to intensity, increase sensitivity slightly
        const intensity = Math.min(volume / 20, 1.0);

        if (intensity > 0.05) {
          // Pseudo-randomly pick a viseme based on time
          const time = Date.now();
          const visemeIndex = Math.floor(time / 150) % speechVisemes.length;
          
          let visemeFound = false;

          speechVisemes.forEach((v, idx) => {
            if (head.mtAvatar[v]) {
              visemeFound = true;
              const targetVal = idx === visemeIndex ? intensity : 0;
              const currentVal = head.mtAvatar[v].realtime || 0;
              head.mtAvatar[v].realtime = currentVal + (targetVal - currentVal) * 0.5;
              head.mtAvatar[v].needsUpdate = true;
            }
          });

          // If no RPM visemes exist, use the fallback
          if (!visemeFound && fallbackBlendshape && head.mtAvatar[fallbackBlendshape]) {
            const currentVal = head.mtAvatar[fallbackBlendshape].realtime || 0;
            head.mtAvatar[fallbackBlendshape].realtime = currentVal + (intensity - currentVal) * 0.5;
            head.mtAvatar[fallbackBlendshape].needsUpdate = true;
          }
        } else {
          // Fade all visemes to 0, then release control
          speechVisemes.forEach(v => {
            if (head.mtAvatar[v]) {
              const currentVal = head.mtAvatar[v].realtime || 0;
              if (currentVal > 0.05) {
                head.mtAvatar[v].realtime = currentVal * 0.5;
                head.mtAvatar[v].needsUpdate = true;
              } else if (head.mtAvatar[v].realtime !== null) {
                head.mtAvatar[v].realtime = null; // release
                head.mtAvatar[v].needsUpdate = true;
              }
            }
          });

          if (fallbackBlendshape && head.mtAvatar[fallbackBlendshape]) {
            const currentVal = head.mtAvatar[fallbackBlendshape].realtime || 0;
            if (currentVal > 0.05) {
                head.mtAvatar[fallbackBlendshape].realtime = currentVal * 0.5;
                head.mtAvatar[fallbackBlendshape].needsUpdate = true;
            } else if (head.mtAvatar[fallbackBlendshape].realtime !== null) {
                head.mtAvatar[fallbackBlendshape].realtime = null;
                head.mtAvatar[fallbackBlendshape].needsUpdate = true;
            }
          }
        }
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
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
