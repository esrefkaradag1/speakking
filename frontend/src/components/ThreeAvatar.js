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
    // We must wait until head.mtAvatar is populated by TalkingHead
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
          console.warn("AudioContext init failed:", e);
        }
      }

      // We only need to calculate the volume once per frame here.
      // We will inject the actual mesh manipulation into head.renderer.render
      if (head) {
        let currentVolume = 0;

        if (audioRef.current && !audioRef.current.paused && isTalking) {
          if (analyserRef.current) {
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);

            let sum = 0;
            for(let i=0; i<dataArray.length; i++) {
               sum += dataArray[i];
            }
            currentVolume = sum / dataArray.length;
          }

          // If Web Audio API fails (e.g. Safari restrictions) or returns 0, simulate smooth lip movement
          if (currentVolume === 0) {
            const t = Date.now() / 1000;
            const envelope = (Math.sin(t * 3) + 1) / 2;
            const jaw = (Math.sin(t * 20) + 1) / 2;
            currentVolume = jaw * envelope * 20 + 5; 
          }
        }

        // Store globally for the render hijacker
        window.__threeAvatarIntensity = Math.min(currentVolume / 20, 1.0);
      }
      
      requestRef.current = requestAnimationFrame(loop);
    };

    // Hijack the renderer to apply blendshapes right before WebGL draw
    // This perfectly bypasses TalkingHead's internal state overwrites
    if (head && head.renderer && !head.renderer.__hijackedForLipSync) {
      const originalRender = head.renderer.render;
      head.renderer.__hijackedForLipSync = true;
      
      head.renderer.render = function(scene, camera) {
        const intensity = window.__threeAvatarIntensity || 0;
        
        // Find meshes
        const meshes = [];
        const rootNode = head.scene || head.armature || head.avatarNode || head.ikMesh;
        if (rootNode) {
          rootNode.traverse((node) => {
            if (node.isMesh && node.morphTargetDictionary && node.morphTargetInfluences) {
              meshes.push(node);
            }
          });
        }

        // Apply morph targets directly
        meshes.forEach((mesh) => {
          let visemeFound = false;
          
          if (intensity > 0.05) {
            const time = Date.now();
            const visemeIndex = Math.floor(time / 150) % speechVisemes.length;
            
            speechVisemes.forEach((v, idx) => {
              const targetIdx = mesh.morphTargetDictionary[v];
              if (targetIdx !== undefined) {
                visemeFound = true;
                const targetVal = idx === visemeIndex ? intensity : 0;
                const currentVal = mesh.morphTargetInfluences[targetIdx];
                mesh.morphTargetInfluences[targetIdx] = currentVal + (targetVal - currentVal) * 0.5;
              }
            });

            if (!visemeFound) {
              const fb = mesh.morphTargetDictionary['jawOpen'] !== undefined ? 'jawOpen' : 
                        (mesh.morphTargetDictionary['mouthOpen'] !== undefined ? 'mouthOpen' : 'viseme_O');
              const targetIdx = mesh.morphTargetDictionary[fb];
              if (targetIdx !== undefined) {
                const currentVal = mesh.morphTargetInfluences[targetIdx];
                mesh.morphTargetInfluences[targetIdx] = currentVal + (intensity - currentVal) * 0.5;
              }
            }
          } else {
            // Fade out
            speechVisemes.forEach((v) => {
              const targetIdx = mesh.morphTargetDictionary[v];
              if (targetIdx !== undefined) {
                const currentVal = mesh.morphTargetInfluences[targetIdx];
                mesh.morphTargetInfluences[targetIdx] = currentVal > 0.05 ? currentVal * 0.5 : 0;
              }
            });
            const fb = mesh.morphTargetDictionary['jawOpen'] !== undefined ? 'jawOpen' : 
                      (mesh.morphTargetDictionary['mouthOpen'] !== undefined ? 'mouthOpen' : 'viseme_O');
            const targetIdx = mesh.morphTargetDictionary[fb];
            if (targetIdx !== undefined) {
              const currentVal = mesh.morphTargetInfluences[targetIdx];
              mesh.morphTargetInfluences[targetIdx] = currentVal > 0.05 ? currentVal * 0.5 : 0;
            }
          }
        });

        // Call original renderer
        originalRender.call(this, scene, camera);
      };
    }





    requestRef.current = requestAnimationFrame(loop);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
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
