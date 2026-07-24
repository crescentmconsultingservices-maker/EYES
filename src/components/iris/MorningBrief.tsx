'use client';

import { useState, useEffect } from 'react';
import ReceiptPanel from './ReceiptPanel';
import { useAuth } from '@/context/AuthContext';

export default function MorningBrief() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    overnightChanges: [],
    openCommitments: [],
    slipping: [],
    horizon: []
  });
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);

  useEffect(() => {
    async function loadBrief() {
      try {
        const res = await fetch('/api/iris/v0/morning-brief');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch morning brief", err);
      } finally {
        setLoading(false);
      }
    }
    loadBrief();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const ReceiptChip = ({ edge }: { edge: any }) => (
    <button 
      onClick={(e) => { 
        e.stopPropagation();
        setActiveReceipt({ 
          source_url: edge.source_url || '#', 
          span: edge.memory_content || `Confidence: ${(edge.confidence * 100).toFixed(1)}% | Valid From: ${new Date(edge.valid_from).toLocaleDateString()}` 
        });
      }}
      style={{ 
        background: 'rgba(255,255,255,0.05)', 
        border: '1px solid rgba(255,255,255,0.1)', 
        borderRadius: '4px', 
        padding: '2px 6px', 
        fontSize: '11px', 
        fontFamily: 'monospace', 
        color: '#94a3b8', 
        cursor: 'pointer',
        marginLeft: '12px',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
    >
      Receipt
    </button>
  );

  const SectionCard = ({ title, items, renderItem, delay }: { title: string, items: any[], renderItem: (item: any) => React.ReactNode, delay: string }) => (
    <div style={{ 
      background: 'var(--bg-secondary)', 
      padding: '24px', 
      borderRadius: '16px', 
      border: '1px solid var(--border)',
      animation: `slideUpFade 0.6s ease-out ${delay} forwards`,
      opacity: 0,
      transform: 'translateY(20px)'
    }}>
      <h3 style={{ fontSize: '16px', color: '#e2e8f0', margin: '0 0 16px 0', fontWeight: 600 }}>{title}</h3>
      {items.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: '14px', fontStyle: 'italic' }}>Nothing surfaced today.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: '#cbd5e1', borderBottom: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingBottom: idx < items.length - 1 ? '12px' : '0' }}>
              <div style={{ flex: 1, paddingRight: '16px' }}>
                {renderItem(item)}
              </div>
              <ReceiptChip edge={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '40px', paddingBottom: '100px' }}>
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      
      <div style={{ marginBottom: '40px', animation: 'slideUpFade 0.6s ease-out forwards' }}>
        <h2 style={{ fontSize: 'clamp(28px, 6vw, 42px)', color: '#f8fafc', marginBottom: '8px', lineHeight: 1.2, fontFamily: 'Fraunces, serif', fontWeight: 500 }}>
          {getGreeting()}, {user?.name || 'User'}.
        </h2>
        <p style={{ color: '#94a3b8', margin: 0, fontSize: '16px' }}>Here is your morning synthesis.</p>
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: '14px', fontStyle: 'italic', animation: 'slideUpFade 0.6s ease-out 0.2s forwards', opacity: 0 }}>
          Compiling the graph...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <SectionCard 
            title="What changed overnight" 
            items={data.overnightChanges} 
            delay="0.1s"
            renderItem={(item) => (
              <span>
                <strong>{item.head?.name || 'Unknown'}</strong> {item.relation_label.replace(/_/g, ' ')} <strong>{item.tail?.name || 'Unknown'}</strong>
              </span>
            )}
          />

          <SectionCard 
            title="Open commitments" 
            items={data.openCommitments} 
            delay="0.2s"
            renderItem={(item) => (
              <span>
                Committed to <strong>{item.tail?.name || 'Unknown'}</strong>: {item.head?.name || 'Unknown'}
                <br />
                <span style={{ fontSize: '12px', color: '#64748b' }}>Since {new Date(item.valid_from).toLocaleDateString()}</span>
              </span>
            )}
          />

          <SectionCard 
            title="Slipping" 
            items={data.slipping} 
            delay="0.3s"
            renderItem={(item) => (
              <span>
                <strong>{item.head?.name || 'Unknown'}</strong> is delayed on <strong>{item.tail?.name || 'Unknown'}</strong>
                <br />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.8 }}>This hasn't moved since {new Date(item.valid_from).toLocaleDateString()} — still current?</span>
              </span>
            )}
          />

          <SectionCard 
            title="On the horizon" 
            items={data.horizon} 
            delay="0.4s"
            renderItem={(item) => (
              <span>
                <strong>{item.head?.name || 'Unknown'}</strong> {item.relation_label.replace(/_/g, ' ')} <strong>{item.tail?.name || 'Unknown'}</strong>
                <br />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Expected: {new Date(item.valid_from).toLocaleDateString()}</span>
              </span>
            )}
          />

        </div>
      )}

      <ReceiptPanel receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />
    </div>
  );
}
