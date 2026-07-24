'use client';

import { useRouter } from 'next/navigation';

export interface Receipt {
  source_url: string;
  span?: string;
  [key: string]: any;
}

interface ReceiptPanelProps {
  receipt: Receipt | null;
  onClose: () => void;
}

export default function ReceiptPanel({ receipt, onClose }: ReceiptPanelProps) {
  const router = useRouter();

  if (!receipt) return null;

  return (
    <>
      {/* Invisible Backdrop for click-away to close */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99,
          background: 'transparent'
        }}
      />
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: '400px',
        background: 'rgba(15, 15, 20, 0.95)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        padding: '24px',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
        animation: 'slideIn 0.3s ease-out forwards'
      }}>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', color: '#e2e8f0', margin: 0, fontWeight: 600 }}>Investigation Panel</h2>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6' }}>
          <p style={{ marginBottom: '8px' }}><strong>Source URL:</strong></p>
          {receipt.source_url.startsWith('/') ? (
            <button 
              onClick={() => router.push(receipt.source_url)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', wordBreak: 'break-all', display: 'block', marginBottom: '24px', textAlign: 'left', cursor: 'pointer', padding: 0 }}
            >
              {receipt.span}
            </button>
          ) : (
            <a href={receipt.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary)', wordBreak: 'break-all', display: 'block', marginBottom: '24px' }}>
              {receipt.source_url} →
            </a>
          )}
          
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px', marginBottom: '12px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Extracted Context
            </p>
            <p style={{ margin: 0, fontStyle: 'italic', color: '#f8fafc' }}>
              "{receipt.span || 'No specific text span extracted for this source.'}"
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
