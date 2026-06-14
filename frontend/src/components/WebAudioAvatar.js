import React, { useEffect, useRef, useState } from 'react';

/**
 * WebAudioAvatar
 * Uses Web Audio API to analyze audio volume from the provided audioRef
 * and animates a mouth or scales a visual element to simulate lip sync.
 */
export default function WebAudioAvatar({ 
  audioRef, 
  active = true, 
  isTalking = false, 
  className = "" 
}) {
  const [volume, setVolume] = useState(0);
  const animationRef = useRef(null);
  const contextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!active || !audioRef || !audioRef.current) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setVolume(0);
      return;
    }
    
    const audioEl = audioRef.current;
    
    // Create AudioContext only once
    if (!contextRef.current) {
      const handlePlay = () => {
        if (!contextRef.current) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          const ctx = new AudioContext();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          
          try {
            const source = ctx.createMediaElementSource(audioEl);
            source.connect(analyser);
            analyser.connect(ctx.destination);
            sourceRef.current = source;
          } catch (e) {
            console.warn("WebAudioAvatar context already connected or CORS error", e);
          }
          
          contextRef.current = ctx;
          analyserRef.current = analyser;
        }

        if (contextRef.current.state === 'suspended') {
          contextRef.current.resume();
        }

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        
        const animateMouth = () => {
          analyserRef.current.getByteFrequencyData(dataArray);
          
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          
          // Normalize volume roughly 0 to 1
          const normalizedVol = Math.min(average / 100, 1);
          setVolume(normalizedVol);
          
          animationRef.current = requestAnimationFrame(animateMouth);
        };
        
        animateMouth();
      };
      
      const handlePause = () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        setVolume(0);
      };

      audioEl.addEventListener('play', handlePlay);
      audioEl.addEventListener('pause', handlePause);
      audioEl.addEventListener('ended', handlePause);

      // If already playing when mounted
      if (!audioEl.paused) {
        handlePlay();
      }

      // Cleanup listeners on unmount (context is preserved)
      return () => {
        audioEl.removeEventListener('play', handlePlay);
        audioEl.removeEventListener('pause', handlePause);
        audioEl.removeEventListener('ended', handlePause);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      };
    }
  }, [audioRef, active]);

  if (!active) return null;

  // Mouth scale (minimum 0.2 when closed, up to ~1.7 when volume is high)
  const mouthScale = 0.2 + (volume * 1.5);
  
  // Use the newly added teacher image
  const avatarUrl = "/teacher.png";

  return (
    <div className={`absolute inset-0 w-full h-full bg-slate-800 ${className}`}>
      {/* Background avatar face */}
      <img 
        src={avatarUrl} 
        alt="Avatar" 
        className="w-full h-full object-cover object-top" 
      />
      
      {/* CSS Mouth Overlay */}
      <div 
        className={`absolute inset-0 flex flex-col items-center justify-start transition-opacity duration-300 ${isTalking ? 'opacity-100' : 'opacity-0'}`}
        style={{ pointerEvents: 'none', paddingTop: '32%' }} // Adjust paddingTop to hit the teacher's mouth level
      >
        <div 
          className="bg-black rounded-full overflow-hidden flex flex-col justify-between"
          style={{ 
            width: '32px', // Width of the teacher's mouth
            height: '14px',
            marginLeft: '2px', // Slight left/right adjustment if needed
            transform: `scaleY(${mouthScale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.05s linear' // very fast transition for lip sync feel
          }}
        >
          {/* Top teeth */}
          <div className="w-full h-[2px] bg-white opacity-80 rounded-b" />
          {/* Tongue/inner mouth */}
          <div className="w-full h-2 bg-red-800 opacity-70 rounded-t-full mt-auto" />
        </div>
      </div>
    </div>
  );
}
