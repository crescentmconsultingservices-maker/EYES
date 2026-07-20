import React from 'react';

interface Receipt {
  source_url: string;
  span: string;
}

interface AdaptiveCardProps {
  answer: string;
  confidence: number;
  receipts: Receipt[];
  onReceiptClick?: (receipt: Receipt) => void;
}

export function AdaptiveCard({ answer, confidence, receipts, onReceiptClick }: AdaptiveCardProps) {
  const confidencePercent = Math.round(confidence * 100);
  const isHighConfidence = confidencePercent >= 85;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      margin: '16px 0',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.1)'
    }}>
      {/* Answer Section */}
      <div style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: '1.6', marginBottom: '16px' }}>
        {answer}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

      {/* Meta Section (Confidence & Receipts) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#94a3b8' }}>Confidence:</span>
          <span style={{ 
            color: isHighConfidence ? '#10b981' : '#f59e0b',
            fontWeight: 600,
            background: isHighConfidence ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            padding: '2px 6px',
            borderRadius: '4px'
          }}>
            {confidencePercent}%
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {receipts.map((receipt, i) => (
            <button 
              key={i} 
              onClick={() => onReceiptClick && onReceiptClick(receipt)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '4px 8px',
                borderRadius: '6px',
                color: '#38bdf8',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              📄 Receipt {i + 1}
            </button>
          ))}
        </div>
        
      </div>
    </div>
  );
}
