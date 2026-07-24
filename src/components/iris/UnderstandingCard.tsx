'use client';

import React, { useState } from 'react';
import ReceiptPanel, { Receipt } from './ReceiptPanel';

export interface UnderstandingCardProps {
  title: string;
  body: string;
  statusBadge?: string;
  badgeType?: 'live' | 'good' | 'accent' | 'slate';
  kicker?: string;
  timestamp?: string;
  receipt?: Receipt;
  onClick?: () => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export default function UnderstandingCard({
  title,
  body,
  statusBadge,
  badgeType = 'slate',
  kicker,
  timestamp,
  receipt,
  onClick,
  style,
  children
}: UnderstandingCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const getBadgeStyle = () => {
    switch (badgeType) {
      case 'live':
        return { background: 'rgba(46, 139, 122, 0.1)', color: 'var(--live, #2e8b7a)', border: '1px solid rgba(46, 139, 122, 0.3)' };
      case 'good':
        return { background: 'rgba(47, 107, 79, 0.1)', color: 'var(--good, #2f6b4f)', border: '1px solid rgba(47, 107, 79, 0.3)' };
      case 'accent':
        return { background: 'var(--accent-soft, #f0d9cd)', color: 'var(--accent-ink, #7a2a0e)', border: '1px solid rgba(191, 61, 17, 0.3)' };
      default:
        return { background: 'rgba(50, 74, 82, 0.08)', color: 'var(--slate, #324a52)', border: '1px solid rgba(50, 74, 82, 0.2)' };
    }
  };

  const handleClaimClick = (e: React.MouseEvent) => {
    if (receipt) {
      e.stopPropagation();
      setShowReceipt(true);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <>
      <article
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
        style={{
          background: 'var(--card, #fbfaf6)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: isHovered ? 'var(--accent-soft, #f0d9cd)' : 'var(--border-paper, #e7e1d4)',
          borderRadius: '8px',
          padding: '18px 20px',
          boxShadow: isHovered ? '0 4px 20px rgba(60, 40, 20, 0.08)' : 'var(--shadow-paper, 0 2px 20px rgba(60, 40, 20, 0.05))',
          transition: 'all 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
          transform: isHovered ? 'translateY(-2px)' : 'none',
          cursor: receipt || onClick ? 'pointer' : 'default',
          position: 'relative',
          ...style
        }}
      >
        {/* Kicker & Status Badge Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          {kicker && (
            <span style={{ 
              fontFamily: 'var(--font-jetbrains, monospace)', 
              fontSize: '11px', 
              textTransform: 'uppercase', 
              letterSpacing: '0.18em', 
              color: 'var(--accent, #bf3d11)', 
              fontWeight: 600 
            }}>
              {kicker}
            </span>
          )}
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
            {timestamp && (
              <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', color: 'var(--ink-faint, #6b6557)' }}>
                {timestamp}
              </span>
            )}

            {statusBadge && (
              <span style={{ 
                fontFamily: 'var(--font-jetbrains, monospace)', 
                fontSize: '10px', 
                textTransform: 'uppercase', 
                letterSpacing: '0.08em', 
                padding: '2px 8px', 
                borderRadius: '6px', 
                fontWeight: 600,
                ...getBadgeStyle()
              }}>
                {statusBadge}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 style={{ 
          fontFamily: 'var(--font-inter, sans-serif)', 
          fontSize: '16px', 
          fontWeight: 600, 
          color: 'var(--ink-deep, #1a1714)', 
          margin: '0 0 6px 0',
          lineHeight: 1.35
        }}>
          {title}
        </h3>

        {/* Body line with quiet claim affordance (§02 Spec) */}
        <p style={{ 
          fontFamily: 'var(--font-inter, sans-serif)', 
          fontSize: '14px', 
          lineHeight: 1.55, 
          color: 'var(--ink-soft, #3b372f)', 
          margin: 0 
        }}>
          {body}
        </p>

        {children}

        {/* Hover Proof Affordance Link */}
        {receipt && (
          <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid rgba(231, 225, 212, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button
              onClick={handleClaimClick}
              style={{
                background: 'transparent',
                border: 'none',
                color: isHovered ? 'var(--accent, #bf3d11)' : 'var(--ink-faint, #6b6557)',
                fontSize: '11px',
                fontFamily: 'var(--font-jetbrains, monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                cursor: 'pointer',
                padding: 0,
                textDecoration: isHovered ? 'underline' : 'none',
                transition: 'color 0.15s ease'
              }}
            >
              Proof & Receipt (4 Depths) →
            </button>
          </div>
        )}
      </article>

      {/* Slide-in Receipt Panel when activated */}
      {showReceipt && (
        <ReceiptPanel
          receipt={receipt || { source_url: '#', span: title }}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </>
  );
}
