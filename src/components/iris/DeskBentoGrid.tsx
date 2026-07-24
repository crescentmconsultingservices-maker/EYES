'use client';

import { useState } from 'react';
import UnderstandingCard from './UnderstandingCard';

export default function DeskBentoGrid() {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const priorities = [
    {
      id: 'p1',
      title: 'Finalize IRIS UI Specification Alignment',
      body: 'Integrate Paper & Ink tokens, 4-layer Receipt Panel, and Workstation intent cards before founder review.',
      kicker: 'Priority #1 · Engine',
      statusBadge: 'Critical',
      badgeType: 'accent' as const,
      timestamp: 'Today · 09:00',
      receipt: {
        source_url: '/iris?view=workstation',
        span: 'Finalize IRIS UI Specification Alignment before founder review.',
        sender: 'Abhi (Founder Office)',
        timestamp: '2026-07-24 · 09:00 UTC',
        confidence: 0.99,
        validity: 'believed since 2026-07-24 · active'
      }
    },
    {
      id: 'p2',
      title: 'Audit Modal API Key & Supabase Vector Store',
      body: 'Ensure Chronic Engine endpoint auth headers remain secure across all production requests.',
      kicker: 'Priority #2 · Security',
      statusBadge: 'Verified',
      badgeType: 'good' as const,
      timestamp: 'Today · 08:30',
      receipt: {
        source_url: '/settings',
        span: 'Audit Modal API Key & Supabase Vector Store auth headers.',
        sender: 'Security Daemon',
        timestamp: '2026-07-24 · 08:30 UTC',
        confidence: 0.96
      }
    },
    {
      id: 'p3',
      title: 'Review Revenue Leak Detection Scan Pipeline',
      body: 'Verify zero fabricated default estimates and accurate thread-level parsing.',
      kicker: 'Priority #3 · Audit',
      statusBadge: 'Live',
      badgeType: 'live' as const,
      timestamp: 'Today · 07:45',
      receipt: {
        source_url: '/iris?view=investigate',
        span: 'Review Revenue Leak Detection Scan Pipeline accuracy.',
        sender: 'Audit Lens Daemon',
        timestamp: '2026-07-24 · 07:45 UTC',
        confidence: 0.95
      }
    }
  ];

  const overnightChanges = [
    {
      id: 'c1',
      title: 'Synthesis Pass Completed',
      body: 'Processed 42 new event nodes across Slack and GitHub threads.',
      kicker: 'Overnight Pass',
      timestamp: '04:12 UTC',
      receipt: {
        source_url: '/iris?view=signals',
        span: 'Processed 42 new event nodes across Slack and GitHub threads.',
        sender: 'EYES Synthesis Pipeline',
        timestamp: '2026-07-24 · 04:12 UTC'
      }
    },
    {
      id: 'c2',
      title: 'Competitor Pattern Logged',
      body: 'Logged Vendo YC S26 architecture paper for counter-positioning analysis.',
      kicker: 'Intel Synthesis',
      timestamp: '02:30 UTC',
      receipt: {
        source_url: '/iris?view=dossiers',
        span: 'Logged Vendo YC S26 architecture paper for counter-positioning analysis.',
        sender: 'Intel Synthesis Worker',
        timestamp: '2026-07-24 · 02:30 UTC'
      }
    }
  ];

  const slippingItems = [
    {
      id: 's1',
      title: 'Kokoro-82M Local TTS Pipeline Test',
      body: 'Hasn\'t moved since July 11th — still current or superseded?',
      kicker: 'Check-in Needed',
      statusBadge: 'Delayed',
      badgeType: 'accent' as const,
      timestamp: '13 days quiet',
      receipt: {
        source_url: '/iris?view=timeline',
        span: 'Kokoro-82M Local TTS Pipeline Test hasn\'t moved since July 11th.',
        sender: 'Check-in Monitor',
        timestamp: '2026-07-11 · 14:00 UTC',
        validity: 'believed since 2026-07-11 · check-in requested'
      }
    }
  ];

  const todayNowStrip = [
    { hour: '08:00', label: 'Overnight Synthesis Synced', type: 'system' },
    { hour: '09:30', label: 'Phase 0 Primitives Verified', type: 'good' },
    { hour: '11:00', label: 'Voice Orb Speech Filter Applied', type: 'good' },
    { hour: '12:30', label: 'Desk Bento Grid Surface Live', type: 'active' },
    { hour: '16:00', label: 'Workstation Intent Cards Review', type: 'scheduled' }
  ];

  return (
    <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '24px 0 48px 0', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Fraunces Greeting Block (Section 05 Spec) */}
      <header style={{ marginBottom: '32px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '6px' }}>
          TUESDAY · WHILE YOU SLEPT, UNDERSTANDING KEPT MOVING
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          Good morning, Abhi.
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '15px', margin: 0 }}>
          Here is the state of now — what needs doing, overnight changes, and today's active flow.
        </p>
      </header>

      {/* Bento Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '20px' }}>
        
        {/* Top 3 Priorities (Cols 1-8, Row 1) */}
        <section style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 600 }}>
              ● Live Priorities (Top 3)
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', color: 'var(--accent, #bf3d11)' }}>
              Openable to Proof
            </span>
          </div>

          {priorities.map((p) => (
            <UnderstandingCard
              key={p.id}
              title={p.title}
              body={p.body}
              kicker={p.kicker}
              statusBadge={p.statusBadge}
              badgeType={p.badgeType}
              timestamp={p.timestamp}
              receipt={p.receipt}
            />
          ))}
        </section>

        {/* Right Column: Slipping & Ambient (Cols 9-12) */}
        <section style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Slipping Check-in Widget */}
          <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '18px' }}>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent, #bf3d11)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Slipping · Check-in Tone
            </span>
            {slippingItems.map(item => (
              <div key={item.id}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink-deep, #1a1714)', margin: '0 0 4px 0' }}>{item.title}</h4>
                <p style={{ fontSize: '13px', color: 'var(--ink-soft, #3b372f)', margin: '0 0 10px 0', lineHeight: 1.5, fontStyle: 'italic' }}>"{item.body}"</p>
                <button 
                  onClick={() => alert('Check-in status updated: Still Active.')}
                  style={{ background: 'transparent', border: '1px solid var(--accent, #bf3d11)', color: 'var(--accent, #bf3d11)', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-jetbrains, monospace)', cursor: 'pointer' }}
                >
                  Confirm Still Current →
                </button>
              </div>
            ))}
          </div>

          {/* Ambient Music / Pulse Widget */}
          <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '18px' }}>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', display: 'block', marginBottom: '8px' }}>
              Ambient Room Pulse
            </span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--ink, #16140f)' }}>Focus Soundscape</p>
                <span style={{ fontSize: '11px', color: 'var(--ink-faint, #6b6557)', fontFamily: 'var(--font-jetbrains, monospace)' }}>Ethereal Ambient Synth</span>
              </div>
              <button
                onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                style={{
                  background: isPlayingAudio ? 'var(--accent, #bf3d11)' : 'var(--paper-2, #f2ede3)',
                  color: isPlayingAudio ? '#ffffff' : 'var(--ink-deep, #1a1714)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                {isPlayingAudio ? '⏸' : '▶'}
              </button>
            </div>
          </div>
        </section>

        {/* Changed Overnight (Cols 1-6, Row 2) */}
        <section style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--ink-faint, #6b6557)', fontWeight: 600 }}>
            Changed Overnight
          </span>
          {overnightChanges.map((c) => (
            <UnderstandingCard
              key={c.id}
              title={c.title}
              body={c.body}
              kicker={c.kicker}
              timestamp={c.timestamp}
              receipt={c.receipt}
            />
          ))}
        </section>

        {/* Horizontal Today Now-Strip (Cols 7-12, Row 2) */}
        <section style={{ gridColumn: 'span 6', background: 'var(--card, #fbfaf6)', border: '1px solid var(--border-paper, #e7e1d4)', borderRadius: '8px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--live, #2e8b7a)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="live-dot-breathe" /> Today Now-Strip (Mini-Timeline)
          </span>

          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', padding: '12px 0 4px 0' }}>
            {todayNowStrip.map((item, i) => (
              <div key={i} style={{ minWidth: '120px', padding: '10px', background: 'var(--paper-2, #f2ede3)', borderRadius: '6px', border: item.type === 'active' ? '1px solid var(--accent, #bf3d11)' : '1px solid transparent' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '10px', color: item.type === 'active' ? 'var(--accent, #bf3d11)' : 'var(--ink-faint, #6b6557)', fontWeight: 600 }}>
                  {item.hour}
                </span>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', fontWeight: 500, color: 'var(--ink, #16140f)', lineHeight: 1.3 }}>
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* One Emotional Beat (Section 05 Spec) */}
      <footer style={{ marginTop: '40px', paddingTop: '18px', borderTop: '1px solid #e7e1d4', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-serif-display, serif)', fontStyle: 'italic', fontSize: '16px', color: 'var(--accent, #bf3d11)', margin: 0 }}>
          "The work is honest when the proof stays underneath."
        </p>
      </footer>
    </div>
  );
}
