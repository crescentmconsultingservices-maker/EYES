'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface VoiceOrbRef {
  speak: (text: string) => void;
}

interface VoiceOrbProps {
  onTranscribe?: (text: string) => void;
}

const VoiceOrb = forwardRef<VoiceOrbRef, VoiceOrbProps>(({ onTranscribe }, ref) => {
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>('');

  const isActiveSessionRef = useRef<boolean>(false);
  const isCommittingRef = useRef<boolean>(false);
  const activeRecognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTextRef = useRef<string>('');

  const stopCurrentAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
      audioRef.current = null;
    }
    if (synthRef.current && synthRef.current.speaking) {
      try {
        synthRef.current.cancel();
      } catch {}
    }
  };

  const clearTimers = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
    return () => {
      stopCurrentAudio();
      clearTimers();
      if (activeRecognitionRef.current) {
        try { activeRecognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  const handleSpeechFinished = () => {
    setVoiceState('idle');
    // Seamless continuous loop: resume listening automatically for live call experience
    if (isActiveSessionRef.current) {
      setTimeout(() => {
        if (isActiveSessionRef.current) {
          startListening();
        }
      }, 500);
    }
  };

  useImperativeHandle(ref, () => ({
    speak: async (text: string) => {
      stopCurrentAudio();
      clearTimers();
      setVoiceState('speaking');

      // 1. Attempt Kokoro-82M server synthesis first
      try {
        const res = await fetch('/api/iris/v0/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: 'af_heart' }),
        });

        if (res.ok && res.headers.get('content-type')?.includes('audio/')) {
          const blob = await res.blob();
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          audio.onplay = () => setVoiceState('speaking');
          audio.onended = () => {
            audioRef.current = null;
            URL.revokeObjectURL(audioUrl);
            handleSpeechFinished();
          };
          audio.onerror = () => {
            audioRef.current = null;
            handleSpeechFinished();
          };
          await audio.play();
          return;
        }
      } catch (kokoroErr) {
        console.warn('Kokoro-82M audio stream note, using web fallback:', kokoroErr);
      }

      // 2. Web Speech Synthesis fallback
      if (!synthRef.current) {
        handleSpeechFinished();
        return;
      }

      try {
        if (synthRef.current.paused) synthRef.current.resume();
        synthRef.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => setVoiceState('speaking');
        utterance.onend = () => handleSpeechFinished();
        utterance.onerror = (e) => {
          console.warn('Speech synthesis playback note:', e);
          handleSpeechFinished();
        };

        synthRef.current.speak(utterance);
      } catch (err) {
        console.error('Speech synthesis error:', err);
        handleSpeechFinished();
      }
    }
  }));

  const commitTranscript = (finalText: string) => {
    if (isCommittingRef.current) return;
    const clean = finalText.trim();
    if (!clean) return;

    isCommittingRef.current = true;
    clearTimers();

    if (onTranscribe) {
      onTranscribe(clean);
    }

    lastTextRef.current = '';
    setLiveTranscript('');
    setVoiceState('idle');

    if (activeRecognitionRef.current) {
      try { activeRecognitionRef.current.stop(); } catch {}
      activeRecognitionRef.current = null;
    }

    setTimeout(() => {
      isCommittingRef.current = false;
    }, 800);
  };

  const startListening = async () => {
    setErrorMessage(null);
    stopCurrentAudio();
    clearTimers();
    lastTextRef.current = '';
    isCommittingRef.current = false;

    if (typeof window === 'undefined') return;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (micErr: any) {
      console.warn('Microphone stream access warning:', micErr);
      setErrorMessage('Microphone access denied. Allow mic permission in browser URL bar.');
      setVoiceState('idle');
      isActiveSessionRef.current = false;
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Browser does not support SpeechRecognition. Please use Chrome/Edge.');
      return;
    }

    if (activeRecognitionRef.current) {
      try { activeRecognitionRef.current.abort(); } catch {}
      activeRecognitionRef.current = null;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setVoiceState('listening');
        setLiveTranscript('');
      };

      rec.onresult = (event: any) => {
        stopCurrentAudio();
        let transcriptStr = '';
        for (let i = 0; i < event.results.length; i++) {
          transcriptStr += event.results[i][0]?.transcript || '';
        }

        if (transcriptStr.trim()) {
          lastTextRef.current = transcriptStr;
          setLiveTranscript(transcriptStr);
          setVoiceState('listening');

          // Reset 1.1s Silence Timer on Speech Activity
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (lastTextRef.current.trim()) {
              commitTranscript(lastTextRef.current);
            }
          }, 1100);
        }
      };

      rec.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed') {
          setErrorMessage('Microphone permission blocked. Please click the lock icon in Chrome URL bar.');
          setVoiceState('idle');
          isActiveSessionRef.current = false;
          clearTimers();
        } else if (event.error === 'no-speech') {
          setLiveTranscript('');
        } else if (event.error !== 'aborted') {
          if (!isActiveSessionRef.current) setVoiceState('idle');
        }
      };

      rec.onend = () => {
        if (lastTextRef.current.trim()) {
          commitTranscript(lastTextRef.current);
        } else if (isActiveSessionRef.current) {
          setTimeout(() => {
            if (isActiveSessionRef.current) startListening();
          }, 400);
        } else {
          setVoiceState('idle');
          setLiveTranscript('');
          clearTimers();
        }
      };

      activeRecognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setErrorMessage('Could not access microphone: ' + (err.message || 'Unknown error'));
      setVoiceState('idle');
    }
  };

  const toggleVoiceSession = () => {
    setErrorMessage(null);

    // If active or listening/speaking, tap stops/toggles the live session
    if (isActiveSessionRef.current || voiceState !== 'idle') {
      if (voiceState === 'speaking') {
        stopCurrentAudio();
        setVoiceState('listening');
        startListening();
        return;
      }

      if (voiceState === 'listening' && lastTextRef.current.trim()) {
        commitTranscript(lastTextRef.current);
        return;
      }

      // Turn OFF voice session completely
      isActiveSessionRef.current = false;
      stopCurrentAudio();
      clearTimers();
      if (activeRecognitionRef.current) {
        try { activeRecognitionRef.current.abort(); } catch {}
        activeRecognitionRef.current = null;
      }
      setVoiceState('idle');
      setLiveTranscript('');
    } else {
      // Turn ON live continuous voice call session
      isActiveSessionRef.current = true;
      startListening();
    }
  };

  // Dynamic styling per Paper & Ink Tokens
  let orbBg = '#e8e2d5';
  let iconColor = '#2c2824';
  let glowSize = 0;
  let pulseAnimation = 'none';

  if (voiceState === 'listening') {
    orbBg = 'var(--accent, #bf3d11)';
    iconColor = '#ffffff';
    glowSize = 24;
    pulseAnimation = 'pulse 1.2s infinite ease-in-out';
  } else if (voiceState === 'speaking') {
    orbBg = 'var(--live, #2e8b7a)';
    iconColor = '#ffffff';
    glowSize = 24;
    pulseAnimation = 'pulse 0.8s infinite ease-in-out';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.85; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Live transcript or error popup */}
      {(liveTranscript || errorMessage) && (
        <div style={{
          position: 'absolute',
          bottom: '52px',
          background: errorMessage ? '#fcedea' : '#102a24',
          color: errorMessage ? '#bf3d11' : '#4ade80',
          border: `1.5px solid ${errorMessage ? '#bf3d11' : '#2e8b7a'}`,
          borderRadius: '12px',
          padding: '8px 16px',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: 'var(--font-jetbrains, monospace)',
          whiteSpace: 'nowrap',
          maxWidth: '360px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
          zIndex: 100
        }}>
          {errorMessage ? `⚠️ ${errorMessage}` : `🎙️ ${liveTranscript}`}
        </div>
      )}

      {/* Unified Voice Orb Button */}
      <button 
        type="button"
        onClick={toggleVoiceSession}
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          background: orbBg,
          border: voiceState === 'idle' ? '1px solid #c8beaa' : 'none',
          cursor: 'pointer',
          boxShadow: voiceState !== 'idle' ? `0 0 ${glowSize / 2}px ${orbBg}` : 'none',
          animation: pulseAnimation,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
        title={
          voiceState === 'idle' 
            ? 'Start Live Voice Call with IRIS' 
            : voiceState === 'listening' 
              ? 'Live Call Active. Tap to send or stop' 
              : 'IRIS Speaking. Tap to interrupt'
        }
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {voiceState === 'idle' ? (
            <>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </>
          ) : voiceState === 'listening' ? (
            <>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" fill={iconColor}></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </>
          ) : (
            <rect x="8" y="8" width="8" height="8" fill={iconColor} />
          )}
        </svg>
      </button>
    </div>
  );
});

VoiceOrb.displayName = 'VoiceOrb';

export default VoiceOrb;
