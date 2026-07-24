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
      background: 'rgba(15, 15, 20, 0.4)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '20px',
      padding: '24px',
      margin: '8px 0',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Subtle top glare */}
      <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }} />

      {/* Answer Section */}
      <div style={{ fontSize: '15.5px', color: '#f1f5f9', lineHeight: '1.7', marginBottom: '20px', letterSpacing: '0.01em' }}>
        {answer}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.05)', margin: '20px 0' }} />

      {/* Meta Section (Confidence & Receipts) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Confidence</span>
          <span style={{ 
            color: isHighConfidence ? '#34d399' : '#fbbf24',
            fontWeight: 700,
            background: isHighConfidence ? 'rgba(52, 211, 153, 0.1)' : 'rgba(251, 191, 36, 0.1)',
            padding: '4px 8px',
            borderRadius: '6px',
            border: `1px solid ${isHighConfidence ? 'rgba(52, 211, 153, 0.2)' : 'rgba(251, 191, 36, 0.2)'}`,
            boxShadow: `0 0 10px ${isHighConfidence ? 'rgba(52, 211, 153, 0.1)' : 'rgba(251, 191, 36, 0.1)'}`
          }}>
            {confidencePercent}%
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {receipts.map((receipt, i) => (
            <button 
              key={i} 
              onClick={() => onReceiptClick && onReceiptClick(receipt)}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'; e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(56, 189, 248, 0.05)'; e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.15)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.15)',
                padding: '6px 10px',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                fontWeight: 600,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              Receipt {i + 1}
            </button>
          ))}
        </div>
        
      </div>
    </div>
  );
}
