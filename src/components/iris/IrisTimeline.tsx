'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import ReceiptPanel from './ReceiptPanel';

export default function IrisTimeline() {
  const { theme } = useAuth();
  const brandAccent = theme === 'ember' ? '#e06a3b' : theme === 'light' ? '#0f172a' : '#ffffff';
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);

  useEffect(() => {
    async function loadTimeline() {
      try {
        const res = await fetch('/api/iris/v0/timeline');
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (err) {
        console.error("Failed to load timeline", err);
      } finally {
        setLoading(false);
      }
    }
    
    loadTimeline();
  }, []);

  if (loading) {
     return <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px', fontSize: '14px', letterSpacing: '0.1em', animation: 'pulse 2s infinite' }}>Loading timeline...</div>;
  }

  const handleReceipt = (edge: any) => {
    setActiveReceipt({
      source_url: edge.source_url || '#',
      span: edge.memory_content || `Confidence: ${(edge.confidence * 100).toFixed(1)}% | Valid From: ${new Date(edge.valid_from).toLocaleDateString()}`
    });
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px', paddingBottom: '100px', animation: 'fadeIn 0.5s ease-out' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
      `}</style>
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 36px)', color: brandAccent, marginBottom: '8px', lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em' }}>Chronological Timeline</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '16px', marginBottom: '16px' }}>A reverse-chronological mapping of extracted facts and memory states over the last 90 days.</p>
      </div>

      {events.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '32px', borderRadius: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          No memories or beliefs found in the Knowledge Graph yet.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Vertical Line */}
          <div style={{ position: 'absolute', left: '23px', top: '20px', bottom: 0, width: '2px', background: 'rgba(255,255,255,0.1)' }} />

          {events.map((evt, i) => {
            const isSuperseded = evt.valid_to !== null;
            
            return (
              <div key={i} style={{ display: 'flex', marginBottom: '32px', position: 'relative', alignItems: 'flex-start' }}>
                {/* Timeline Dot */}
                <div style={{ 
                  width: '16px', height: '16px', borderRadius: '50%', background: isSuperseded ? '#64748b' : brandAccent, 
                  position: 'absolute', left: '16px', top: '24px', zIndex: 2,
                  boxShadow: isSuperseded ? 'none' : '0 0 16px rgba(224, 106, 59, 0.4)',
                  border: '3px solid var(--bg-primary)',
                  transition: 'background 0.3s'
                }} />
                
                <div style={{ paddingLeft: '56px', width: '100%' }}>
                  <div style={{ 
                    background: 'var(--bg-secondary)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '16px', 
                    padding: '24px', 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                    transition: 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)', 
                    cursor: 'default',
                    opacity: isSuperseded ? 0.7 : 1
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.02)'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: isSuperseded ? '#94a3b8' : brandAccent, fontWeight: 700, background: isSuperseded ? 'rgba(148, 163, 184, 0.1)' : 'rgba(255, 255, 255, 0.1)', padding: '4px 10px', borderRadius: '6px' }}>
                        {evt.relation_label.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontWeight: 500 }}>
                        {new Date(evt.valid_from).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ 
                        margin: '0', 
                        fontSize: '17px', 
                        color: isSuperseded ? '#94a3b8' : '#f1f5f9', 
                        fontWeight: 500, 
                        letterSpacing: '-0.01em',
                        textDecoration: isSuperseded ? 'line-through' : 'none'
                      }}>
                        <strong>{evt.head?.name || 'Unknown'}</strong> → <strong>{evt.tail?.name || 'Unknown'}</strong>
                      </h4>
                      
                      <button 
                        onClick={() => handleReceipt(evt)}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.2s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = brandAccent; e.currentTarget.style.borderColor = brandAccent; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                      >
                        Receipt
                      </button>
                    </div>

                    {isSuperseded && (
                      <div style={{ marginTop: '12px', fontSize: '13px', color: '#e06a3b', fontStyle: 'italic' }}>
                        Superseded on {new Date(evt.valid_to).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReceiptPanel receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
}
