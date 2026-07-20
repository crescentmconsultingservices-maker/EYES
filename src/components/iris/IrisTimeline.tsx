'use client';

import { useState, useEffect } from 'react';

export default function IrisTimeline() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px', paddingBottom: '100px', animation: 'fadeIn 0.5s ease-out' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
      `}</style>
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: 'clamp(28px, 5vw, 36px)', color: '#e06a3b', marginBottom: '8px', lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em' }}>Chronological Timeline</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '16px' }}>A reverse-chronological mapping of extracted facts and memories.</p>
      </div>

      {events.length === 0 ? (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '32px', borderRadius: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No memories found in the Knowledge Graph yet.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* Vertical Line */}
          <div style={{ position: 'absolute', left: '23px', top: '20px', bottom: 0, width: '2px', background: 'var(--border)' }} />

          {events.map((evt, i) => (
            <div key={i} style={{ display: 'flex', marginBottom: '32px', position: 'relative', alignItems: 'flex-start' }}>
              {/* Timeline Dot */}
              <div style={{ 
                width: '16px', height: '16px', borderRadius: '50%', background: '#e06a3b', 
                position: 'absolute', left: '16px', top: '24px', zIndex: 2,
                boxShadow: '0 0 16px rgba(224, 106, 59, 0.4)',
                border: '3px solid var(--bg-primary)'
              }} />
              
              <div style={{ paddingLeft: '56px', width: '100%' }}>
                <div style={{ 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '16px', 
                  padding: '24px', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                  transition: 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)', 
                  cursor: 'default' 
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.02)'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 700, background: 'rgba(56, 189, 248, 0.1)', padding: '4px 10px', borderRadius: '6px' }}>
                      {evt.platform || 'System'}
                    </span>
                    <span style={{ fontWeight: 500 }}>{new Date(evt.timestamp).toLocaleString()}</span>
                  </div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '18px', color: 'var(--text-primary)', fontWeight: 600, letterSpacing: '-0.01em' }}>
                    {evt.title ? evt.title.substring(0, 80) + (evt.title.length > 80 ? '...' : '') : 'Extracted Memory'}
                  </h4>
                  <p style={{ margin: 0, fontSize: '15px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    {evt.content ? (evt.content.length > 300 ? evt.content.substring(0, 300) + '...' : evt.content) : 'No content available.'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
