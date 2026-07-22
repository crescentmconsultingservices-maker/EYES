'use client';

import { useState, useEffect } from 'react';

export default function Signals() {
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSignals() {
      try {
        const res = await fetch('/api/iris/v0', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: "Analyze my recent activity and generate a high-priority system signal or insight based on the evidence." })
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.understanding?.answer) {
            setSignals([
              { 
                id: 1, 
                type: 'INSIGHT', 
                priority: data.understanding.confidence > 0.8 ? 'HIGH' : 'MEDIUM', 
                title: 'IRIS Synthesis', 
                time: 'Just now', 
                desc: data.understanding.answer, 
                color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' 
              }
            ]);
            return;
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
      
      // Fallback if no real evidence is found
      setSignals([
        { id: 1, type: 'SYSTEM', priority: 'LOW', title: 'No New Signals', time: 'Just now', desc: 'No recent anomalous behavior or critical insights detected by IRIS.', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.1)' }
      ]);
    }
    loadSignals();
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px', paddingBottom: '100px', animation: 'fadeIn 0.5s ease-out' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 36px)', color: '#e06a3b', marginBottom: '8px', lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em' }}>Signals</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '16px' }}>High-priority alerts and system insights.</p>
      </div>

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
            <div style={{ width: '6px', background: `linear-gradient(to bottom, ${sig.color}, transparent)` }} />
            <div style={{ padding: '24px', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ background: sig.bg, color: sig.color, fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px', letterSpacing: '0.05em' }}>
                    {sig.type}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.05em' }}>{sig.priority} PRIORITY</span>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500 }}>{sig.time}</span>
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '-0.01em' }}>{sig.title}</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6' }}>{sig.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
