'use client';

import { useState, useEffect, useRef } from 'react';

export default function VoiceOrb({ onTranscribe }: { onTranscribe?: (text: string) => void }) {
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasMicPermission(true);
      setVoiceState('listening');
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateAudioLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        
        // Normalize 0 to 1
        setAudioLevel(Math.min(avg / 128, 1));
        animationRef.current = requestAnimationFrame(updateAudioLevel);
      };

      updateAudioLevel();

      // MOCK: Simulate Kyutai response after 5 seconds
      setTimeout(() => {
        if (voiceState === 'listening' || streamRef.current) {
          setVoiceState('processing');
          setTimeout(() => {
            setVoiceState('speaking');
            if (onTranscribe) onTranscribe("Mock Kyutai Unmute response: I heard you! This is the prototype in action.");
            setTimeout(() => {
              stopRecording();
            }, 3000);
          }, 1500);
        }
      }, 5000);

    } catch (err) {
      console.error("Microphone permission denied:", err);
      alert("Microphone permission is required for Voice Mode.");
    }
  };

  const stopRecording = () => {
    setVoiceState('idle');
    setAudioLevel(0);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const toggleVoice = () => {
    if (voiceState === 'idle') {
      startRecording();
    } else {
      stopRecording();
    }
  };

  // Dynamic styles based on voice state
  let orbColor = '#94a3b8'; // idle
  let glowSize = 0;
  let pulseAnimation = 'none';

  if (voiceState === 'listening') {
    orbColor = '#ef4444'; // red for listening
    glowSize = 20 + audioLevel * 40;
  } else if (voiceState === 'processing') {
    orbColor = '#38bdf8'; // blue for thinking
    pulseAnimation = 'pulse 1s infinite';
  } else if (voiceState === 'speaking') {
    orbColor = '#10b981'; // green for speaking
    glowSize = 15 + Math.random() * 20; // fake speaking modulation
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
        title={voiceState === 'idle' ? 'Voice Mode' : 'Stop Voice Mode'}
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
}
