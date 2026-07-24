import React, { useEffect, useState } from 'react';

interface Receipt {
  source_url: string;
  span?: string;
  [key: string]: any;
}

interface IntentCardsProps {
  intent: string;
  intentData: any[];
  onReceiptClick: (receipt: Receipt) => void;
}

export default function IntentCards({ intent, intentData, onReceiptClick }: IntentCardsProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || intent === 'none') {
    return null;
  }

  const hasData = intentData && intentData.length > 0;

  const handleReceipt = (edge: any) => {
    onReceiptClick({
      source_url: edge.source_url || '#',
      span: `Confidence: ${(edge.confidence * 100).toFixed(1)}% | Valid From: ${new Date(edge.valid_from).toLocaleDateString()}`
    });
  };

  const CardBase = ({ children, index }: { children: React.ReactNode, index: number }) => (
    <div style={{
      background: 'rgba(15, 15, 20, 0.4)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '16px 20px',
      marginBottom: '12px',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
      opacity: 0,
      transform: 'translateY(20px)',
      animation: `slideUpFade 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.06}s forwards`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ flex: 1, paddingRight: '16px', fontSize: '14.5px', color: '#e2e8f0', lineHeight: '1.6' }}>
        {children}
      </div>
      <button 
        onClick={(e) => {
          // Find the edge passed as context
          // In a real app we'd pass it directly to CardBase but we'll handle it inside the specific cards
        }}
        className="intent-receipt-btn"
        style={{ display: 'none' }}
      >
        Receipt
      </button>
    </div>
  );

  const renderCommitment = (edge: any, i: number) => (
    <CardBase key={i} index={i}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          Committed to <strong>{edge.tail?.name || 'Unknown'}</strong>: {edge.head?.name || 'Unknown'}
          <br />
          <span style={{ fontSize: '12px', color: '#64748b' }}>Since {new Date(edge.valid_from).toLocaleDateString()}</span>
        </div>
        <button 
          onClick={() => handleReceipt(edge)}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.2s ease' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          Receipt
        </button>
      </div>
    </CardBase>
  );

  const renderSlippage = (edge: any, i: number) => (
    <CardBase key={i} index={i}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{edge.head?.name || 'Unknown'}</strong> is delayed on <strong>{edge.tail?.name || 'Unknown'}</strong>
          <br />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.9 }}>This hasn't moved since {new Date(edge.valid_from).toLocaleDateString()} — still current?</span>
        </div>
        <button 
          onClick={() => handleReceipt(edge)}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.2s ease' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          Receipt
        </button>
      </div>
    </CardBase>
  );

  const renderChange = (edge: any, i: number) => (
    <CardBase key={i} index={i}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ textDecoration: 'line-through', color: '#64748b', marginRight: '8px' }}>Previous Belief</span>
          <br/>
          <strong>{edge.head?.name || 'Unknown'}</strong> {edge.relation_label.replace(/_/g, ' ')} <strong>{edge.tail?.name || 'Unknown'}</strong>
          <br />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Superseded on {new Date(edge.valid_to).toLocaleDateString()}</span>
        </div>
        <button 
          onClick={() => handleReceipt(edge)}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.2s ease' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          Receipt
        </button>
      </div>
    </CardBase>
  );

  return (
    <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column' }}>
      {!hasData ? (
        <CardBase index={0}>
          <div style={{ fontStyle: 'italic', color: '#64748b' }}>
            No {intent} records surfaced in the graph.
          </div>
        </CardBase>
      ) : (
        <>
          {intent === 'commitment' && intentData.map((edge, i) => renderCommitment(edge, i))}
          {intent === 'slippage' && intentData.map((edge, i) => renderSlippage(edge, i))}
          {intent === 'change' && intentData.map((edge, i) => renderChange(edge, i))}
        </>
      )}
    </div>
  );
}
