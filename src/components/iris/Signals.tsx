'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import ReceiptPanel from './ReceiptPanel';

export default function Signals() {
  const { theme } = useAuth();
  const brandAccent = theme === 'ember' ? '#e06a3b' : theme === 'light' ? '#0f172a' : '#ffffff';
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);

  useEffect(() => {
    async function loadSignals() {
      try {
        const res = await fetch('/api/iris/v0/signals');
        if (res.ok) {
          const data = await res.json();
          setSignals(data.signals || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadSignals();
  }, []);

  const handleReceipt = (sig: any) => {
    setActiveReceipt({
      source_url: sig.source_url || '#',
      span: `Source: Acute Layer | Alert ID: ${sig.id?.substring(0,8) || 'N/A'}`
    });
  };

  if (loading) {
     return <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px', fontSize: '14px', letterSpacing: '0.1em', animation: 'pulse 2s infinite' }}>Loading signals...</div>;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px', paddingBottom: '100px', animation: 'fadeIn 0.5s ease-out' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
      `}</style>
      
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 36px)', color: brandAccent, marginBottom: '8px', lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em' }}>Signals</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '16px' }}>Strictly filtered alerts that change a decision, prevent a mistake, or reveal an opportunity.</p>
      </div>

      {signals.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '32px', borderRadius: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          No time-sensitive signals have passed the strict filter today.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {signals.map((sig: any) => (
            <div 
              key={sig.id} 
              onMouseEnter={() => setHoverId(sig.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{ 
                display: 'flex', 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border)', 
                borderRadius: '16px', 
                overflow: 'hidden',
                boxShadow: hoverId === sig.id ? '0 12px 40px rgba(0,0,0,0.08)' : '0 4px 12px rgba(0,0,0,0.02)',
                transform: hoverId === sig.id ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)'
              }}
            >
              <div style={{ padding: '24px', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ color: brandAccent, fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em', background: 'rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '6px' }}>
                    {(sig.score * 100).toFixed(0)}% SIGNAL STRENGTH
                  </span>
                  
                  <button 
                    onClick={() => handleReceipt(sig)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = brandAccent; e.currentTarget.style.borderColor = brandAccent; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                  >
                    Receipt
                  </button>
                </div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '-0.01em' }}>{sig.title}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6' }}>{sig.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReceiptPanel receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
}
