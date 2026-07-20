'use client';

import { useState, useEffect } from 'react';

export default function MorningBrief() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, notes: 0, chats: 0 });
  const [synthesis, setSynthesis] = useState("Loading synthesis...");

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch('/api/iris/v0/morning-brief');
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
          setSynthesis(data.synthesis);
        }
      } catch (err) {
        console.error("Failed to fetch morning brief", err);
        setSynthesis("Failed to load synthesis.");
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
        <div>
          <h2 style={{ fontSize: 'clamp(24px, 5vw, 32px)', color: '#e06a3b', marginBottom: '8px', lineHeight: 1.2 }}>Morning Brief</h2>
          <p style={{ color: '#94a3b8', margin: 0 }}>Your daily intelligence summary for {new Date().toLocaleDateString()}</p>
        </div>
        <div style={{ color: '#e06a3b', opacity: 0.8, filter: 'drop-shadow(0 0 8px rgba(224, 106, 59, 0.4))' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v2"></path>
            <path d="M4.93 4.93l1.41 1.41"></path>
            <path d="M19.07 4.93l-1.41 1.41"></path>
            <path d="M2 12h2"></path>
            <path d="M20 12h2"></path>
            <path d="M5.26 15.26A9 9 0 0 1 12 6a9 9 0 0 1 6.74 9.26"></path>
            <path d="M2 22h20"></path>
            <path d="M16 22v-2a4 4 0 0 0-8 0v2"></path>
          </svg>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '40px' }}>
        
        {/* Main Prominent Card */}
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'var(--bg-secondary)', 
          padding: '40px', 
          borderRadius: '24px', 
          border: '1px solid var(--border)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          cursor: 'default',
          textAlign: 'center'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.04)'; }}
        >
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px', fontWeight: 600 }}>Total Events Indexed (24h)</div>
          <div style={{ fontSize: '72px', color: 'var(--text-primary)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {loading ? '-' : stats.total}
          </div>
        </div>
        
        {/* Side-by-Side Secondary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: 'var(--bg-secondary)', 
            padding: '32px', 
            borderRadius: '20px', 
            border: '1px solid var(--border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(16, 185, 129, 0.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.03)'; }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', fontWeight: 600 }}>Notes Extracted</div>
            <div style={{ fontSize: '48px', color: '#10b981', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {loading ? '-' : stats.notes}
            </div>
          </div>

          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: 'var(--bg-secondary)', 
            padding: '32px', 
            borderRadius: '20px', 
            border: '1px solid var(--border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'default'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(56, 189, 248, 0.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.03)'; }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', fontWeight: 600 }}>Chat Interactions</div>
            <div style={{ fontSize: '48px', color: '#38bdf8', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {loading ? '-' : stats.chats}
            </div>
          </div>

        </div>
      </div>

      <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '24px', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>✦</span> AI Synthesis
        </h3>
        <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: '1.6', fontSize: '15px' }}>
          {loading ? "Analyzing your digital footprint..." : synthesis}
        </p>
      </div>
    </div>
  );
}
