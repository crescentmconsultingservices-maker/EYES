import React, { useState, useRef, useEffect } from 'react';

interface Receipt {
  source_url: string;
  span: string;
  sender?: string;
  timestamp?: string;
  confidence?: number;
  validity?: string;
}

interface AdaptiveCardProps {
  answer: string;
  confidence: number;
  receipts: Receipt[];
  onReceiptClick?: (receipt: Receipt) => void;
}

export function AdaptiveCard({ answer, confidence, receipts, onReceiptClick }: AdaptiveCardProps) {
  const confidencePercent = Math.round(confidence * 100);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const handleTogglePlay = async () => {
    if (isPlaying) {
      stopAudio();
      return;
    }

    if (!answer) return;

    // Stop any existing playback first
    stopAudio();
    setIsPlaying(true);

    try {
      const res = await fetch('/api/iris/v0/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: answer, voice: 'af_heart' }),
      });

      if (res.ok && res.headers.get('content-type')?.includes('audio/')) {
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          audioRef.current = null;
          URL.revokeObjectURL(audioUrl);
          setIsPlaying(false);
        };

        audio.onerror = () => {
          audioRef.current = null;
          URL.revokeObjectURL(audioUrl);
          setIsPlaying(false);
        };

        await audio.play();
        return;
      }
    } catch (err) {
      console.warn('Kokoro TTS server note, using Web Speech fallback:', err);
    }

    // Fallback to Web Speech API
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(answer);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('Speech synthesis error:', e);
        setIsPlaying(false);
      }
    } else {
      setIsPlaying(false);
    }
  };

function parseInlineFormatting(text: string) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 700, color: 'var(--ink-deep, #1a1714)' }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} style={{
          background: 'var(--paper-2, #f2ede3)',
          padding: '2px 6px',
          borderRadius: '4px',
          fontFamily: 'var(--font-jetbrains, monospace)',
          fontSize: '13.5px',
          border: '1px solid var(--border-paper, #e7e1d4)'
        }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderFormattedAnswer(text: string) {
  if (!text) return null;

  const blocks = text.split(/\n\s*\n/).filter(Boolean);

  return blocks.map((block, idx) => {
    const trimmed = block.trim();

    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      return (
        <blockquote
          key={idx}
          style={{
            margin: '12px 0',
            padding: '10px 16px',
            background: 'var(--paper-2, #f4efe6)',
            borderLeft: '3px solid var(--accent, #bf3d11)',
            borderRadius: '0 8px 8px 0',
            fontSize: '14.5px',
            color: 'var(--ink-soft, #3b372f)',
            fontStyle: 'normal'
          }}
        >
          {parseInlineFormatting(quoteText)}
        </blockquote>
      );
    }

    const lines = trimmed.split('\n').filter(Boolean);
    const hasListPattern = lines.some(line => /^\s*(\d+\.|\-|\*|🔴)\s+/.test(line));

    if (hasListPattern) {
      return (
        <div key={idx} style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lines.map((line, lIdx) => {
            const isItem = /^\s*(\d+\.|\-|\*|🔴)\s+/.test(line);
            if (isItem) {
              const cleanLine = line.replace(/^\s*(\d+\.|\-|\*|🔴)\s+/, '');
              return (
                <div key={lIdx} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', fontSize: '15px', lineHeight: '1.6', color: 'var(--ink, #16140f)' }}>
                  <span style={{ color: 'var(--accent, #bf3d11)', fontWeight: 700 }}>•</span>
                  <span>{parseInlineFormatting(cleanLine)}</span>
                </div>
              );
            }
            return (
              <p key={lIdx} style={{ margin: '4px 0', fontSize: '15.5px', lineHeight: '1.7', color: 'var(--ink, #16140f)' }}>
                {parseInlineFormatting(line)}
              </p>
            );
          })}
        </div>
      );
    }

    return (
      <p key={idx} style={{ margin: '0 0 12px 0', fontSize: '15.5px', lineHeight: '1.7', color: 'var(--ink, #16140f)', whiteSpace: 'pre-wrap' }}>
        {parseInlineFormatting(trimmed)}
      </p>
    );
  });
}

  return (
    <div style={{
      background: 'transparent',
      padding: '8px 0 16px 0',
      margin: '4px 0',
      position: 'relative'
    }}>
      {/* Un-bubbled Flowing Prose (Section 06 Spec: "a colleague talking, not a chat bubble") */}
      <div style={{
        fontSize: '15.5px',
        color: 'var(--ink, #16140f)',
        lineHeight: '1.7',
        fontFamily: 'var(--font-inter, sans-serif)',
        marginBottom: '12px'
      }}>
        {renderFormattedAnswer(answer)}
      </div>

      {/* Quiet Claim-Openable Receipt Depth Affordances & Audio Player */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontSize: '11px',
        fontFamily: 'var(--font-jetbrains, monospace)',
        color: 'var(--ink-faint, #6b6557)',
        marginTop: '6px',
        flexWrap: 'wrap'
      }}>
        {/* Listen Audio Button */}
        <button
          type="button"
          onClick={handleTogglePlay}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: isPlaying ? 'var(--accent-soft, #f0d9cd)' : '#ffffff',
            color: isPlaying ? 'var(--accent-ink, #7a2a0e)' : 'var(--ink-soft, #3b372f)',
            border: `1.5px solid ${isPlaying ? 'var(--accent, #bf3d11)' : '#d4cbba'}`,
            borderRadius: '14px',
            padding: '3px 10px',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'var(--font-jetbrains, monospace)',
            cursor: 'pointer',
            transition: 'all 0.18s ease',
            boxShadow: isPlaying ? '0 2px 8px rgba(191, 61, 17, 0.18)' : '0 1px 3px rgba(0,0,0,0.04)'
          }}
          title={isPlaying ? 'Stop audio' : 'Listen to audio answer'}
          onMouseEnter={(e) => {
            if (!isPlaying) {
              e.currentTarget.style.background = '#f5f0e6';
              e.currentTarget.style.borderColor = 'var(--accent, #bf3d11)';
              e.currentTarget.style.color = 'var(--accent, #bf3d11)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isPlaying) {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#d4cbba';
              e.currentTarget.style.color = 'var(--ink-soft, #3b372f)';
            }
          }}
        >
          {isPlaying ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span>STOP AUDIO</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <span>LISTEN</span>
            </>
          )}
        </button>

        <span style={{ textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.8 }}>
          Confidence {confidencePercent}%
        </span>

        {receipts && receipts.length > 0 && (
          <div style={{ display: 'flex', gap: '12px' }}>
            {receipts.map((receipt, i) => (
              <span
                key={i}
                onClick={() => onReceiptClick && onReceiptClick(receipt)}
                style={{
                  color: 'var(--accent, #bf3d11)',
                  cursor: 'pointer',
                  borderBottom: '1px dashed var(--accent-soft, #f0d9cd)',
                  transition: 'all 0.15s ease',
                  fontSize: '11px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderBottomStyle = 'solid';
                  e.currentTarget.style.color = 'var(--accent-ink, #7a2a0e)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderBottomStyle = 'dashed';
                  e.currentTarget.style.color = 'var(--accent, #bf3d11)';
                }}
              >
                ↳ proof [{i + 1}]
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

