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
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    // Initialize Speech Synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }

    // Initialize Speech Recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = false;
          rec.interimResults = false;
          rec.lang = 'en-US';

          rec.onspeechstart = () => {
            if (synthRef.current && synthRef.current.speaking) {
              synthRef.current.cancel();
              setVoiceState('listening');
            }
          };

          rec.onresult = (event: any) => {
            const transcript = event.results[0][0]?.transcript;
            if (synthRef.current && synthRef.current.speaking) {
              synthRef.current.cancel();
            }
            if (transcript && onTranscribe) {
              onTranscribe(transcript);
            }
            setVoiceState('idle');
          };

          rec.onerror = (event: any) => {
            if (event.error === 'not-allowed') {
              setErrorMessage('Microphone access denied. Please allow microphone permission.');
            } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
              console.warn('Speech recognition status:', event.error);
            }
            setVoiceState('idle');
          };

          rec.onend = () => {
            setVoiceState('idle');
          };

          recognitionRef.current = rec;
        } catch (e) {
          console.warn('SpeechRecognition init warning:', e);
        }
      }
    }
  }, [onTranscribe]);

  useImperativeHandle(ref, () => ({
    speak: (text: string) => {
      if (!synthRef.current) return;
      
      try {
        if (synthRef.current.paused) {
          synthRef.current.resume();
        }
        synthRef.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => setVoiceState('speaking');
        utterance.onend = () => setVoiceState('idle');
        utterance.onerror = (e) => {
          console.warn('Speech synthesis playback note:', e);
          setVoiceState('idle');
        };

        synthRef.current.speak(utterance);
      } catch (err) {
        console.error('Speech synthesis error:', err);
        setVoiceState('idle');
      }
    }
  }));

  const toggleVoice = () => {
    setErrorMessage(null);

    // If currently speaking, stop TTS
    if (voiceState === 'speaking') {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      setVoiceState('idle');
      return;
    }

    // If currently listening, stop STT
    if (voiceState === 'listening') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setVoiceState('idle');
      return;
    }

    // If idle, start STT speech recognition or fallback voice test
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setVoiceState('listening');
      } catch (e: any) {
        // If already started or browser state busy, try stopping first
        try {
          recognitionRef.current.stop();
          setTimeout(() => {
            recognitionRef.current?.start();
            setVoiceState('listening');
          }, 100);
        } catch {
          setVoiceState('idle');
        }
      }
    } else {
      // Fallback: Test Speech Synthesis audio voice out loud if SpeechRecognition is missing
      if (synthRef.current) {
        const testUtterance = new SpeechSynthesisUtterance("IRIS Voice Engine active and listening.");
        testUtterance.onstart = () => setVoiceState('speaking');
        testUtterance.onend = () => setVoiceState('idle');
        synthRef.current.speak(testUtterance);
      } else {
        alert("Speech API not supported in this browser environment.");
      }
    }
  };

  // Dynamic styles based on Paper & Ink tokens (§01 & §13 Spec)
  let orbBg = '#e8e2d5'; // high contrast warm paper
  let iconColor = '#2c2824'; // crisp dark ink icon
  let glowSize = 0;
  let pulseAnimation = 'none';

  if (voiceState === 'listening') {
    orbBg = 'var(--accent, #bf3d11)'; // terracotta accent for listening
    iconColor = '#ffffff';
    glowSize = 20;
    pulseAnimation = 'pulse 1.2s infinite ease-in-out';
  } else if (voiceState === 'speaking') {
    orbBg = 'var(--live, #2e8b7a)'; // breathing teal for speaking
    iconColor = '#ffffff';
    glowSize = 20; 
    pulseAnimation = 'pulse 0.8s infinite ease-in-out';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {errorMessage && (
        <div style={{
          position: 'absolute',
          bottom: '50px',
          background: 'var(--accent-soft, #f0d9cd)',
          color: 'var(--accent-ink, #7a2a0e)',
          border: '1px solid var(--accent, #bf3d11)',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '11px',
          fontFamily: 'var(--font-jetbrains, monospace)',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          ⚠️ {errorMessage}
        </div>
      )}
      
      <button 
        type="button"
        onClick={toggleVoice}
        style={{
          width: '40px',
          height: '40px',
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
        title={voiceState === 'idle' ? 'Click to speak or listen' : 'Stop voice session'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {voiceState === 'idle' ? (
            <>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
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
