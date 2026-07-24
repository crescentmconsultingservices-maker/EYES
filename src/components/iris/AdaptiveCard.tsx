import React from 'react';

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
        {answer}
      </div>

      {/* Quiet Claim-Openable Receipt Depth Affordances (§02 & §06 Spec: No bright chips in default state) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        fontSize: '11px',
        fontFamily: 'var(--font-jetbrains, monospace)',
        color: 'var(--ink-faint, #6b6557)',
        marginTop: '6px'
      }}>
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
