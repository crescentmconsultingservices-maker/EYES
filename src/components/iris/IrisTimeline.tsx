'use client';

import { useState } from 'react';
import UnderstandingCard from './UnderstandingCard';

export default function IrisTimeline() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [zoomScale, setZoomScale] = useState<'day' | 'month'>('day');

  const events = [
    {
      id: 't1',
      date: '2026-07-24',
      category: 'product',
      title: 'IRIS Phase 0 & Phase 1 Specification Alignment',
      body: 'Integrated Paper & Ink tokens, 4-layer Receipt Panel, and Workstation Intent Cards.',
      isSuperseded: false,
      kicker: 'ACTIVE BELIEF · PRODUCT',
      receipt: {
        source_url: '/iris?view=desk',
        span: 'IRIS Phase 0 & Phase 1 Specification Alignment completed.',
        sender: 'IRIS Architect',
        timestamp: '2026-07-24 · 12:30 UTC'
      }
    },
    {
      id: 't2',
      date: '2026-07-18',
      category: 'product',
      title: 'Initial Chat UI Dark Periwinkle Styling',
      body: 'Generic chat bubbles with rounded pill input and static placeholder state.',
      isSuperseded: true,
      supersededText: 'superseded · not deleted',
      replacementTitle: 'Replaced by Paper & Ink Un-bubbled Flowing Prose',
      replacementUrl: '/iris?view=workstation',
      kicker: 'SUPERSEDED BELIEF · PRODUCT',
      receipt: {
        source_url: '/iris?view=timeline',
        span: 'Initial Chat UI Dark Periwinkle Styling superseded by Paper & Ink specification.',
        sender: 'UI Migration Worker',
        timestamp: '2026-07-18 · 16:00 UTC',
        validity: 'superseded on 2026-07-24'
      }
    },
    {
      id: 't3',
      date: '2026-07-11',
      category: 'decisions',
      title: 'Local Kokoro-82M Voice Synthesis Priority',
      body: 'Assumed local Kokoro TTS was primary bottleneck for founder voice chat.',
      isSuperseded: true,
      supersededText: 'superseded · check-in active',
      replacementTitle: 'Replaced by Web Speech SpeechRecognition & Fast Whisper STT',
      replacementUrl: '/iris?view=workstation',
      kicker: 'SUPERSEDED BELIEF · DECISIONS',
      receipt: {
        source_url: '/iris?view=timeline',
        span: 'Kokoro-82M Voice Synthesis Priority superseded by Web Speech STT.',
        sender: 'Voice Architect',
        timestamp: '2026-07-11 · 14:00 UTC',
        validity: 'superseded on 2026-07-20'
      }
    },
    {
      id: 't4',
      date: '2026-07-05',
      category: 'money',
      title: 'Revenue Leak Scan Pipeline Parallelization',
      body: 'Speed up email audit execution 10x using parallelized async processing.',
      isSuperseded: false,
      kicker: 'ACTIVE BELIEF · MONEY',
      receipt: {
        source_url: '/iris?view=investigate',
        span: 'Revenue Leak Scan Pipeline Parallelization verified.',
        sender: 'Audit Engine',
        timestamp: '2026-07-05 · 10:00 UTC'
      }
    }
  ];

  const filteredEvents = events.filter(evt => selectedCategory === 'all' || evt.category === selectedCategory);

  return (
    <div style={{ maxWidth: '780px', width: '100%', margin: '0 auto', padding: '32px 16px 80px 16px', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <header style={{ marginBottom: '24px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '4px' }}>
          SURFACE 4 · THE PAST
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>
          Timeline
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
          The time machine stream. Superseded beliefs remain visible with strikethroughs and links to replacement state nodes.
        </p>
      </header>

      {/* Control Bar: Categories & Zoom Toggle (Section 08 Spec) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', borderBottom: '1px solid #e7e1d4', paddingBottom: '12px' }}>
        {/* Category Filter Chips */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {['all', 'money', 'people', 'product', 'decisions'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                background: selectedCategory === cat ? 'var(--accent, #bf3d11)' : 'var(--paper-2, #f2ede3)',
                color: selectedCategory === cat ? '#ffffff' : 'var(--ink-soft, #3b372f)',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 12px',
                fontSize: '11px',
                fontFamily: 'var(--font-jetbrains, monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Zoom Scale Toggle */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--paper-2, #f2ede3)', padding: '2px', borderRadius: '4px' }}>
          {(['day', 'month'] as const).map((scale) => (
            <button
              key={scale}
              onClick={() => setZoomScale(scale)}
              style={{
                background: zoomScale === scale ? 'var(--card, #fbfaf6)' : 'transparent',
                color: zoomScale === scale ? 'var(--accent, #bf3d11)' : 'var(--ink-faint, #6b6557)',
                border: 'none',
                borderRadius: '3px',
                padding: '2px 8px',
                fontSize: '10px',
                fontFamily: 'var(--font-jetbrains, monospace)',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {scale}
            </button>
          ))}
        </div>
      </div>

      {/* Stream List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
        {/* Vertical Timeline Axis Line */}
        <div style={{ position: 'absolute', left: '16px', top: '10px', bottom: '10px', width: '2px', background: 'var(--border-paper, #e7e1d4)' }} />

        {filteredEvents.map((evt) => (
          <div key={evt.id} style={{ paddingLeft: '36px', position: 'relative' }}>
            {/* Timeline Dot */}
            <div style={{
              position: 'absolute',
              left: '11px',
              top: '20px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: evt.isSuperseded ? 'var(--ink-faint, #6b6557)' : 'var(--accent, #bf3d11)',
              border: '2px solid var(--paper, #faf7f1)',
              boxShadow: evt.isSuperseded ? 'none' : '0 0 8px rgba(191, 61, 17, 0.4)'
            }} />

            {/* Superseded Belief Strikethrough Hero (§08 Spec) */}
            {evt.isSuperseded ? (
              <UnderstandingCard
                title={evt.title}
                body={evt.body}
                kicker={evt.kicker}
                statusBadge="Superseded"
                badgeType="slate"
                timestamp={evt.date}
                receipt={evt.receipt}
                style={{ opacity: 0.75, borderStyle: 'dashed' }}
              >
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #e7e1d4' }}>
                  <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', color: 'var(--ink-faint, #6b6557)', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', textDecoration: 'line-through' }}>
                    {evt.supersededText}
                  </span>
                  <div style={{ marginTop: '4px', fontSize: '12px', fontFamily: 'var(--font-inter, sans-serif)', color: 'var(--accent, #bf3d11)', fontWeight: 600 }}>
                    ↳ Active Replacement: {evt.replacementTitle} →
                  </div>
                </div>
              </UnderstandingCard>
            ) : (
              <UnderstandingCard
                title={evt.title}
                body={evt.body}
                kicker={evt.kicker}
                statusBadge="Active"
                badgeType="good"
                timestamp={evt.date}
                receipt={evt.receipt}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
