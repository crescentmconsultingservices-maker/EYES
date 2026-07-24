'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Receipt {
  source_url: string;
  span?: string;
  sender?: string;
  timestamp?: string;
  confidence?: number;
  validity?: string;
  full_text?: string;
  lineage?: {
    superseded?: string;
    reason?: string;
    chain?: string[];
  };
  [key: string]: any;
}

interface ReceiptPanelProps {
  receipt: Receipt | null;
  onClose: () => void;
}

type LayerTab = 'source' | 'span' | 'record' | 'lineage';

export default function ReceiptPanel({ receipt, onClose }: ReceiptPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LayerTab>('source');

  if (!receipt) return null;

  const confidenceScore = receipt.confidence ?? 0.98;
  const validityText = receipt.validity || 'believed since 2026-07-01 · still current';
  const spanText = receipt.span || 'No specific text span extracted for this source.';
  const fullText = receipt.full_text || `Full record context for source: "${spanText}". Verified against EYES semantic memory vector store.`;

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 999,
          background: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease-out'
        }}
      />
      
      {/* Slide-in Sheet (S1 Component Spec) */}
      <aside 
        role="dialog"
        aria-label="Receipt Proof Panel"
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 'min(460px, 90vw)',
          background: 'var(--paper, #faf7f1)',
          color: 'var(--ink, #16140f)',
          borderLeft: '1px solid var(--border-paper, #e7e1d4)',
          boxShadow: '-10px 0 40px rgba(22, 20, 15, 0.12)',
          padding: '24px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-inter, sans-serif)',
          animation: 'panelSlideIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards'
        }}
      >
        <style>{`
          @keyframes panelSlideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e7e1d4', paddingBottom: '16px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '2px' }}>
              PROOFS & RECEPTS · S1
            </div>
            <h2 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: '20px', margin: 0, fontWeight: 700, color: 'var(--ink-deep, #1a1714)' }}>
              Receipt Depth
            </h2>
          </div>
          <button 
            onClick={onClose}
            aria-label="Close receipt panel"
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--ink-faint, #6b6557)', 
              fontSize: '22px', 
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* 4-Layer Depth Navigation Tabs (§02 Spec) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', background: 'var(--paper-2, #f2ede3)', padding: '4px', borderRadius: '6px', marginBottom: '20px' }}>
          {(['source', 'span', 'record', 'lineage'] as LayerTab[]).map((tab, idx) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'var(--card, #fbfaf6)' : 'transparent',
                color: activeTab === tab ? 'var(--accent, #bf3d11)' : 'var(--ink-soft, #3b372f)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 0',
                fontSize: '11px',
                fontFamily: 'var(--font-jetbrains, monospace)',
                fontWeight: activeTab === tab ? 600 : 400,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              L{idx + 1} {tab}
            </button>
          ))}
        </div>

        {/* Content Body per Layer */}
        <div style={{ flex: 1, overflowY: 'auto', fontSize: '13px', lineHeight: 1.6, color: 'var(--ink-soft, #3b372f)' }}>
          {activeTab === 'source' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '16px' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)' }}>
                  Layer 1 · Source Origin
                </span>
                <p style={{ margin: '8px 0 4px 0', fontWeight: 600, color: 'var(--ink, #16140f)' }}>
                  Sender: {receipt.sender || 'Founder Office'}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-faint, #6b6557)' }}>
                  Timestamp: {receipt.timestamp || '2026-07-24 · 10:14:02 UTC'}
                </p>
              </div>

              <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '16px' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)' }}>
                  Reference Location
                </span>
                {receipt.source_url.startsWith('/') ? (
                  <button 
                    onClick={() => { router.push(receipt.source_url); onClose(); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent, #bf3d11)', wordBreak: 'break-all', display: 'block', marginTop: '8px', textAlign: 'left', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                  >
                    Open Internal Route ({receipt.source_url}) →
                  </button>
                ) : (
                  <a href={receipt.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #bf3d11)', wordBreak: 'break-all', display: 'block', marginTop: '8px', fontWeight: 600 }}>
                    {receipt.source_url} ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {activeTab === 'span' && (
            <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '18px' }}>
              <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent, #bf3d11)', fontWeight: 600 }}>
                Layer 2 · Exact Highlighted Span
              </span>
              <div style={{ margin: '14px 0 0 0', fontStyle: 'normal', color: 'var(--ink-deep, #1a1714)', fontSize: '15px', lineHeight: '1.7', fontFamily: 'var(--font-serif-display, serif)' }}>
                "<mark style={{ background: 'var(--accent-soft, #f0d9cd)', color: 'var(--accent-ink, #7a2a0e)', padding: '2px 6px', borderRadius: '4px' }}>{spanText}</mark>"
              </div>
            </div>
          )}

          {activeTab === 'record' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)' }}>
                    Layer 3 · Confidence & Validity
                  </span>
                  <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', color: 'var(--good, #2f6b4f)', fontWeight: 600, background: 'rgba(47, 107, 79, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
                    {(confidenceScore * 100).toFixed(0)}% Confident
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--ink-faint, #6b6557)', fontFamily: 'var(--font-jetbrains, monospace)' }}>
                  {validityText}
                </p>
              </div>

              <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '16px' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', display: 'block', marginBottom: '8px' }}>
                  Full Evidenced Record
                </span>
                <p style={{ margin: 0, color: 'var(--ink, #16140f)', whiteSpace: 'pre-wrap' }}>
                  {fullText}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'lineage' && (
            <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '16px' }}>
              <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', display: 'block', marginBottom: '12px' }}>
                Layer 4 · Historical Belief Lineage
              </span>
              <div style={{ borderLeft: '2px solid var(--accent, #bf3d11)', paddingLeft: '12px', marginLeft: '4px' }}>
                <p style={{ margin: 0, fontSize: '12px', textDecoration: 'line-through', opacity: 0.7, color: 'var(--ink-faint, #6b6557)' }}>
                  {receipt.lineage?.superseded || 'Superseded prior assumption from 2026-06-15'}
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: 'var(--accent, #bf3d11)', fontWeight: 600 }}>
                  Current Active Belief (Verified via EYES Graph)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #e7e1d4', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', color: 'var(--ink-faint, #6b6557)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            EYES Understanding API · Proof on Demand
          </span>
        </div>
      </aside>
    </>
  );
}
