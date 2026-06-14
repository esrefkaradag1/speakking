import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { createDidTransport } from '../lib/didClient';

const DIDAvatar = forwardRef(
  ({ apiKey, sourceUrl, useProxy = true, active = true, onReady, onDisconnect, onFailed }, ref) => {
    const videoRef = useRef(null);
    const [status, setStatus] = useState('idle');
    const statusRef = useRef('idle');
    const peerConnection = useRef(null);
    const streamId = useRef(null);
    const sessionId = useRef(null);
    const startedRef = useRef(false);
    const onReadyRef = useRef(onReady);
    const onDisconnectRef = useRef(onDisconnect);
    const onFailedRef = useRef(onFailed);
    onReadyRef.current = onReady;
    onDisconnectRef.current = onDisconnect;
    onFailedRef.current = onFailed;

    const transport = useMemo(
      () => createDidTransport({ apiKey, useProxy }),
      [apiKey, useProxy]
    );

    useImperativeHandle(ref, () => ({
      isConnected: () => statusRef.current === 'connected',
      speak: async (text, lang = 'tr') => {
        if (statusRef.current !== 'connected' || !streamId.current || !sessionId.current) {
          throw new Error('D-ID bagli degil');
        }
        await transport.speak(streamId.current, sessionId.current, text, lang);
      },
      speakAndWait: async (text, lang = 'tr') => {
        if (statusRef.current !== 'connected' || !streamId.current || !sessionId.current) {
          throw new Error('D-ID bagli degil');
        }
        await transport.speak(streamId.current, sessionId.current, text, lang);
        await transport.waitForSpeech(text);
      },
    }));

    useEffect(() => {
      if (!active) {
        statusRef.current = 'idle';
        setStatus('idle');
        return undefined;
      }
      if (startedRef.current) return undefined;
      startedRef.current = true;

      let pc;
      let isMounted = true;

      const startStream = async () => {
        try {
          statusRef.current = 'connecting';
          setStatus('connecting');
          const createData = await transport.createStream(sourceUrl);
          if (!createData.id) throw new Error(createData.message || 'Stream olusturulamadi');

          streamId.current = createData.id;
          sessionId.current = createData.session_id;

          pc = new RTCPeerConnection({ iceServers: createData.ice_servers });
          peerConnection.current = pc;

          pc.addEventListener('icecandidate', async (event) => {
            if (event.candidate) {
              await transport.postIce(streamId.current, sessionId.current, event.candidate);
            }
          });

          pc.addEventListener('track', (event) => {
            if (videoRef.current && event.streams[0]) {
              videoRef.current.srcObject = event.streams[0];
              videoRef.current.muted = false;
              videoRef.current.volume = 1;
            }
          });

          pc.addEventListener('iceconnectionstatechange', () => {
            if (!isMounted) return;
            if (pc.iceConnectionState === 'connected') {
              statusRef.current = 'connected';
              setStatus('connected');
              onReadyRef.current?.();
            } else if (
              pc.iceConnectionState === 'failed' ||
              pc.iceConnectionState === 'disconnected'
            ) {
              statusRef.current = 'disconnected';
              setStatus('disconnected');
              onDisconnectRef.current?.();
            }
          });

          await pc.setRemoteDescription(new RTCSessionDescription(createData.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await transport.postSdp(streamId.current, sessionId.current, answer);
        } catch (err) {
          console.warn('D-ID baglanamadi:', err?.message || err);
          if (isMounted) {
            statusRef.current = 'error';
            setStatus('error');
            onFailedRef.current?.(err);
          }
        }
      };

      startStream();

      return () => {
        isMounted = false;
        if (pc) pc.close();
        if (streamId.current) {
          transport.destroyStream(streamId.current, sessionId.current);
        }
      };
    }, [active, sourceUrl, transport]);

    if (!active) return null;

    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        {status !== 'connected' && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">
              {status === 'connecting'
                ? 'Dudak senkronu baglaniyor...'
                : status === 'error'
                  ? 'Avatar kullanilamiyor — sesli mod aktif'
                  : 'Avatar hazirlaniyor...'}
            </p>
          </div>
        )}
      </div>
    );
  }
);

export default DIDAvatar;
