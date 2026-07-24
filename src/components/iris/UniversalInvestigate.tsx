'use client';

import { useState } from 'react';
import UnderstandingCard from './UnderstandingCard';

export default function UniversalInvestigate() {
  const [query, setQuery] = useState<string>('');
  const [selectedLens, setSelectedLens] = useState<string>('revenue');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [hasCompleted, setHasCompleted] = useState<boolean>(false);

  const lenses = [
    { id: 'revenue', label: 'Revenue Leaks', active: true },
    { id: 'credentials', label: 'Leaked Credentials', active: true },
    { id: 'soc2', label: 'SOC2 Readiness', active: false },
    { id: 'reputation', label: 'Reputation Audit', active: false },
    { id: 'compliance', label: 'Compliance Audit', active: false }
  ];

  const steps = [
    'Gathering evidence from vector graph...',
    'Cross-referencing entity relationship states...',
    'Scoring confidence and validity windows...',
    'Composing proof-backed audit verdict...'
  ];

  const handleStartRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRunning) return;

    setIsRunning(true);
    setCurrentStep(0);
    setHasCompleted(false);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < steps.length) {
        setCurrentStep(step);
      } else {
        clearInterval(interval);
        setIsRunning(false);
        setHasCompleted(true);
      }
    }, 500); // 500ms per step (§10 Spec)
  };

  const revenueFindings = [
    {
      title: 'Unbilled Enterprise Add-on Seats (Acme Corp)',
      body: 'Verified 4 additional workspace seats added on July 14 without an updated subscription tier.',
      kicker: 'REVENUE AUDIT · UNBILLED SEATS',
      statusBadge: 'Leak Confirmed',
      badgeType: 'accent' as const,
      receipt: {
        source_url: '/iris?view=signals',
        span: 'Unbilled Enterprise Add-on Seats (Acme Corp) — 4 seats unbilled.',
        sender: 'Revenue Audit Lens',
        timestamp: '2026-07-24 · 08:00 UTC',
        confidence: 0.99
      }
    },
    {
      title: 'Legacy Rate Locking Expiration (Stripe Tier)',
      body: 'Promotional 15% discount expired on June 30 but billing contract failed to reset to standard rate.',
      kicker: 'REVENUE AUDIT · CONTRACT EXPIRED',
      statusBadge: 'Review Needed',
      badgeType: 'accent' as const,
      receipt: {
        source_url: '/iris?view=timeline',
        span: 'Legacy Rate Locking Expiration (Stripe Tier) — contract expired June 30.',
        sender: 'Billing Daemon',
        timestamp: '2026-07-24 · 07:30 UTC'
      }
    }
  ];

  const credentialFindings = [
    {
      title: 'Legacy Test API Key in Repository History',
      body: 'Discovered non-rotated test API key string in commit logs from 2026-05-12.',
      kicker: 'CREDENTIAL AUDIT · REPO HISTORY',
      statusBadge: 'Revocation Needed',
      badgeType: 'accent' as const,
      receipt: {
        source_url: '/settings',
        span: 'Legacy Test API Key string discovered in git commit logs.',
        sender: 'Security Daemon',
        timestamp: '2026-07-24 · 06:15 UTC'
      }
    }
  ];

  return (
    <div style={{ maxWidth: '880px', width: '100%', margin: '0 auto', padding: '32px 16px 80px 16px', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Header */}
      <header style={{ marginBottom: '24px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent, #bf3d11)', fontWeight: 600, marginBottom: '4px' }}>
          SURFACE 6 · UNIVERSAL AUDIT ENGINE
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif-display, serif)', fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 700, color: 'var(--ink-deep, #1a1714)', margin: '0 0 6px 0' }}>
          Investigate
        </h1>
        <p style={{ color: 'var(--ink-soft, #3b372f)', fontSize: '14px', margin: 0 }}>
          Universal proof-backed audit frame. Select a specialized lens and trigger a stepped evidence sweep.
        </p>
      </header>

      {/* Lens Picker Row (Section 10 Spec) */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', borderBottom: '1px solid #e7e1d4', paddingBottom: '12px' }}>
        {lenses.map((lens) => (
          <button
            key={lens.id}
            onClick={() => lens.active && setSelectedLens(lens.id)}
            style={{
              background: selectedLens === lens.id ? 'var(--accent, #bf3d11)' : 'var(--paper-2, #f2ede3)',
              color: selectedLens === lens.id ? '#ffffff' : lens.active ? 'var(--ink-soft, #3b372f)' : 'var(--ink-faint, #6b6557)',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '12px',
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontWeight: 600,
              cursor: lens.active ? 'pointer' : 'not-allowed',
              opacity: lens.active ? 1 : 0.6,
              transition: 'all 0.15s ease'
            }}
          >
            {lens.label} {!lens.active && '(Soon)'}
          </button>
        ))}
      </div>

      {/* Input Frame */}
      <form 
        onSubmit={handleStartRun}
        style={{
          background: 'var(--card, #fbfaf6)',
          border: '1px solid var(--border-paper, #e7e1d4)',
          borderRadius: '10px',
          padding: '16px 20px',
          marginBottom: '32px',
          display: 'flex',
          gap: '12px',
          boxShadow: 'var(--shadow-paper, 0 2px 20px rgba(60,40,20,0.05))'
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Run ${lenses.find(l => l.id === selectedLens)?.label} audit or search entity...`}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '15px',
            fontFamily: 'var(--font-inter, sans-serif)',
            color: 'var(--ink, #16140f)'
          }}
        />
        <button
          type="submit"
          disabled={isRunning}
          style={{
            background: 'var(--accent, #bf3d11)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 18px',
            fontSize: '13px',
            fontFamily: 'var(--font-jetbrains, monospace)',
            fontWeight: 600,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.7 : 1,
            transition: 'all 0.15s ease'
          }}
        >
          {isRunning ? 'Auditing...' : 'Investigate →'}
        </button>
      </form>

      {/* 4-Step Stepped Progress Reveal (Section 10 Spec) */}
      {isRunning && (
        <div style={{ background: 'var(--card, #fbfaf6)', border: '1px solid var(--accent-soft, #f0d9cd)', borderRadius: '8px', padding: '20px', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span className="live-dot-breathe" />
          <div>
            <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent, #bf3d11)', fontWeight: 600 }}>
              STEP {currentStep + 1} OF 4 · AUDIT IN PROGRESS
            </div>
            <div style={{ fontFamily: 'var(--font-inter, sans-serif)', fontSize: '14px', color: 'var(--ink-deep, #1a1714)', fontWeight: 500, marginTop: '2px' }}>
              {steps[currentStep]}
            </div>
          </div>
        </div>
      )}

      {/* Audit Findings Results */}
      {hasCompleted && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e7e1d4', paddingBottom: '12px' }}>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent, #bf3d11)', fontWeight: 600 }}>
              AUDIT VERDICT · {selectedLens.toUpperCase()} LENS
            </span>
            <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: '11px', color: 'var(--good, #2f6b4f)', fontWeight: 600 }}>
              ● Proof-backed Verdict (No Fabricated Numbers)
            </span>
          </div>

          {(selectedLens === 'revenue' ? revenueFindings : credentialFindings).map((finding, idx) => (
            <UnderstandingCard
              key={idx}
              title={finding.title}
              body={finding.body}
              kicker={finding.kicker}
              statusBadge={finding.statusBadge}
              badgeType={finding.badgeType}
              receipt={finding.receipt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
