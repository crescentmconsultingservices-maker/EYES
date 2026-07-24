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
  const [audioLevel, setAudioLevel] = useState(0);
  
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
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (onTranscribe) onTranscribe(transcript);
        };

        recognitionRef.current.onerror = (event: any) => {
          // Gracefully ignore benign browser timeouts (silence/aborted)
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.warn('Speech recognition status:', event.error);
          }
          setVoiceState('idle');
        };

        recognitionRef.current.onend = () => {
          setVoiceState('idle');
        };
      }
    }
  }, [onTranscribe]);

  useImperativeHandle(ref, () => ({
    speak: (text: string) => {
      if (!synthRef.current) return;
      
      // Stop any ongoing speech
      synthRef.current.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setVoiceState('speaking');
      utterance.onend = () => setVoiceState('idle');
      utterance.onerror = () => setVoiceState('idle');
      
      synthRef.current.speak(utterance);
    }
  }));

  const toggleVoice = () => {
    if (voiceState === 'idle') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setVoiceState('listening');
        } catch (e) {
          console.error(e);
        }
      } else {
        alert("Speech Recognition API not supported in this browser.");
      }
    } else {
      if (voiceState === 'listening' && recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (voiceState === 'speaking' && synthRef.current) {
        synthRef.current.cancel();
        setVoiceState('idle');
      }
    }
  };

  // Dynamic styles based on voice state
  let orbColor = '#94a3b8'; // idle
  let glowSize = 0;
  let pulseAnimation = 'none';

  if (voiceState === 'listening') {
    orbColor = '#ef4444'; // red for listening
    glowSize = 40;
    pulseAnimation = 'pulse 1s infinite';
  } else if (voiceState === 'speaking') {
    orbColor = '#10b981'; // green for speaking
    glowSize = 30; 
    pulseAnimation = 'pulse 0.5s infinite';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      
      <button 
        type="button"
        onClick={toggleVoice}
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: orbColor,
          border: 'none',
          cursor: 'pointer',
          boxShadow: voiceState !== 'idle' ? `0 0 ${glowSize / 2}px ${orbColor}` : 'none',
          animation: pulseAnimation,
          transition: 'background 0.3s ease, box-shadow 0.1s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
        title={voiceState === 'idle' ? 'Start Voice Mode' : 'Stop Voice Mode'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {voiceState === 'idle' ? (
            <>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </>
          ) : (
            <rect x="8" y="8" width="8" height="8" fill="white" />
          )}
        </svg>
      </button>
    </div>
  );
});

export default VoiceOrb;
