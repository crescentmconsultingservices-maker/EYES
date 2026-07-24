'use client';

import React from 'react';

interface HonestEmptyStateProps {
  headline?: string;
  subtext?: string;
  suggestionText?: string;
  onSuggestionClick?: () => void;
  style?: React.CSSProperties;
}

export default function HonestEmptyState({
  headline = "No real data present for this surface.",
  subtext = "IRIS renders understanding from live memory. An honest empty beats a fabricated full.",
  suggestionText,
  onSuggestionClick,
  style
}: HonestEmptyStateProps) {
  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        background: 'var(--card, #fbfaf6)',
        border: '1px dashed var(--border-paper, #e7e1d4)',
        borderRadius: '12px',
        margin: '24px 0',
        ...style
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <span className="live-dot-breathe" />
        <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--ink-faint, #6b6557)' }}>
          HONEST EMPTY STATE · S4
        </span>
      </div>

      <h3 style={{
        fontFamily: 'var(--font-serif-display, serif)',
        fontSize: '22px',
        fontWeight: 600,
        color: 'var(--ink-deep, #1a1714)',
        margin: '0 0 8px 0',
        lineHeight: 1.3
      }}>
        {headline}
      </h3>

      <p style={{
        fontFamily: 'var(--font-inter, sans-serif)',
        fontSize: '14px',
        color: 'var(--ink-soft, #3b372f)',
        maxWidth: '480px',
        margin: '0 0 20px 0',
        lineHeight: 1.55
      }}>
        {subtext}
      </p>

      {suggestionText && (
        <button
          onClick={onSuggestionClick}
          style={{
            background: 'transparent',
            border: '1px solid var(--accent, #bf3d11)',
            color: 'var(--accent, #bf3d11)',
            padding: '8px 16px',
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: 'var(--font-jetbrains, monospace)',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.18s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent-soft, #f0d9cd)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {suggestionText} →
        </button>
      )}
    </div>
  );
}
