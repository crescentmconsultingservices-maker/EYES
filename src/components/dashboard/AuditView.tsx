'use client';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useEffect, useRef, useState } from 'react';
import styles from './AuditView.module.css';
import type { ReputationAudit, AuditSummary } from '@/types/dashboard';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { ThinkingVeil } from './ThinkingVeil';
import { createClient } from '@/utils/supabase/client';

interface AuditViewProps {
  onBack: () => void;
  summary?: AuditSummary;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AuditView({ onBack, summary }: AuditViewProps) {
  const [activeAudit, setActiveAudit] = useState<ReputationAudit | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [auditMode, setAuditMode] = useState<'dashboard' | 'running' | 'completed' | 'error'>('dashboard');
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [rerunError, setRerunError] = useState<string | null>(null);
  // Inline confirm state replaces window.confirm()
  const [rerunConfirming, setRerunConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [auditHistory, setAuditHistory] = useState<ReputationAudit[]>([]);

  // Fetch the latest or selected audit on mount, and poll if returning from Stripe
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const searchParams = new URLSearchParams(window.location.search);
    const targetAuditId = searchParams.get('auditId');
    const checkIsSuccessRedirect = typeof window !== 'undefined' && window.location.search.includes('audit=success');
    
    if (checkIsSuccessRedirect) {
      setAuditMode('running'); // Show thinking veil or loading state
    }

    const fetchLatest = async () => {
      try {
        const auditRes = await fetch(targetAuditId ? `/api/audit/${targetAuditId}` : '/api/audit/latest');
        if (auditRes.ok) {
          const data = await auditRes.json();
          if (data && data.id) {
            const safeAudit: ReputationAudit = {
              ...data,
              riskScore: typeof data.riskScore === 'number' && !isNaN(data.riskScore)
                ? data.riskScore
                : typeof data.risk_score === 'number' && !isNaN(data.risk_score)
                  ? data.risk_score
                  : 0,
              mentionsCount: Number(data.mentionsCount ?? data.mentions_count ?? 0),
              commitmentsCount: Number(data.commitmentsCount ?? data.commitments_count ?? 0),
              metadata: data.metadata || {},
            };

            // Check if the audit is recent (created in the last 2 minutes)
            const auditCreatedAt = safeAudit.createdAt ? new Date(safeAudit.createdAt).getTime() : 0;
            const ageMs = Date.now() - auditCreatedAt;
            const isRecent = ageMs < 120000; // 120 seconds

            // If we are returning from a successful payment, we only care about the new audit.
            // If the latest audit in the DB is old and completed, we must wait for the webhook to create the new one.
            if (checkIsSuccessRedirect && safeAudit.status === 'completed' && !isRecent) {
              return false; // Keep polling until the new audit is registered
            }

            setActiveAudit(safeAudit);
            
            // If we came from Stripe, or loaded a specific history item, set correct mode
            if (checkIsSuccessRedirect || targetAuditId) {
              if (checkIsSuccessRedirect) {
                const url = new URL(window.location.href);
                url.searchParams.delete('audit');
                window.history.replaceState({}, document.title, url.pathname + url.search);
              }
              if (safeAudit.status === 'completed') {
                setAuditMode('completed');
              } else {
                setAuditMode('running');
              }
            } else if (safeAudit.status === 'analysis' || safeAudit.status === 'pending') {
              // If the latest audit is active, automatically show the progress screen
              setAuditMode('running');
            } else if (safeAudit.status === 'completed') {
              // If the latest audit is already completed, allow viewing it directly in completed view
              setAuditMode('completed');
            }
            return true; // Found the correct audit
          }
        }
      } catch (err) {
        console.error('Failed to fetch audit:', err);
      }
      return false; // Not found yet
    };

    fetchLatest().then((found) => {
      if (!found && checkIsSuccessRedirect) {
        interval = setInterval(async () => {
          const isFound = await fetchLatest();
          if (isFound) clearInterval(interval);
        }, 2000);
      }
    });

    return () => { 
      if (interval) clearInterval(interval); 
    };
  }, []);

  // Fetch audit history for the history table
  useEffect(() => {
    fetch('/api/audit/history')
      .then(r => r.json())
      .then(d => {
        const rawList = Array.isArray(d?.audits) ? d.audits : [];
        const safeList: ReputationAudit[] = rawList.map((a: any) => ({
          ...a,
          riskScore: typeof a.riskScore === 'number' && !isNaN(a.riskScore)
            ? a.riskScore
            : typeof a.risk_score === 'number' && !isNaN(a.risk_score)
              ? a.risk_score
              : 0,
          mentionsCount: Number(a.mentionsCount ?? a.mentions_count ?? 0),
          commitmentsCount: Number(a.commitmentsCount ?? a.commitments_count ?? 0),
          metadata: a.metadata || {},
        }));
        setAuditHistory(safeList.slice(0, 8));
      })
      .catch(() => {});
  }, []);

  // Poll to refresh the activeAudit data when the certificate view is showing
  // (the ThinkingVeil handles all completion detection while running)
  useEffect(() => {
    if (auditMode !== 'completed' || !activeAudit?.id) return;

    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/audit/${activeAudit.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data) return;
        setActiveAudit(prev => ({
          ...(prev ?? {} as Partial<ReputationAudit>),
          ...data,
          riskScore: typeof data.riskScore === 'number' && !isNaN(data.riskScore)
            ? data.riskScore
            : typeof data.risk_score === 'number' && !isNaN(data.risk_score)
              ? data.risk_score
              : (prev?.riskScore ?? 0),
          mentionsCount: Number(data.mentionsCount ?? data.mentions_count ?? prev?.mentionsCount ?? 0),
          commitmentsCount: Number(data.commitmentsCount ?? data.commitments_count ?? prev?.commitmentsCount ?? 0),
          metadata: data.metadata || prev?.metadata || {},
        } as ReputationAudit));
        stopped = true; // single refresh on mount is enough
      } catch (err) {
        console.warn('[Audit Poll] failed:', err);
      }
    };

    poll();
    return () => { stopped = true; };
  }, [activeAudit?.id, auditMode]);

  const handleStartAudit = async (type: string = 'full') => {
    setIsInitiating(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/audit/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.auditId) {
          setActiveAudit({
            id: data.auditId,
            status: 'analysis',
            createdAt: new Date().toISOString(),
            riskScore: 0,
            mentionsCount: 0,
            commitmentsCount: 0,
            summaryNarrative: '',
            reportUrl: undefined,
            connectorsCovered: [],
            metadata: {},
          } as unknown as ReputationAudit);
          setAuditMode('running');
        } else {
          setErrorMessage('Failed to initialize reputation audit.');
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || 'Failed to start audit. Check server logs.');
      }
    } catch (err) {
      console.error('Initiation failed:', err);
      setErrorMessage('A network error occurred.');
    } finally {
      setIsInitiating(false);
    }
  };

  // 1. DASHBOARD MODE (Default Selection & Overview)
  if (auditMode === 'dashboard') {
    return (
      <div className={styles.auditContainer}>
        {/* Modern Minimal Breadcrumb */}
        <div className={styles.breadcrumbBar}>
          <button 
            className={styles.backBtnMinimal} 
            onClick={onBack}
            aria-label="Back to dashboard"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>DASHBOARD</span>
          </button>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbCurrent}>REPUTATION AUDIT</span>
        </div>

        {/* Hero Section */}
        <header className={styles.heroSection}>
          <div className={styles.heroPreTitle}>AI-POWERED THREAT INTELLIGENCE</div>
          <h1 className={styles.heroMainTitle}>Reputation & Risk Audit</h1>
          <p className={styles.heroSubtitle}>
            Deep multi-source analysis of your public and internal digital footprint. We detect behavioral patterns, sentiment anomalies, and unfulfilled commitments that could impact your reputation.
          </p>
        </header>

        {/* Inline Error Notification — replaces alert() */}
        {errorMessage && (
          <div style={{
            margin: '0 0 24px',
            padding: '14px 18px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px',
            color: 'var(--accent-red, #ef4444)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <span>⚠ {errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
            >×</button>
          </div>
        )}

        {/* Audit Tier Cards */}
        <div className={styles.grid}>
          {/* Card 1: Full Reputation Audit */}
          <div className={`${styles.card} ${styles.featuredCard} stagger-1`}>
            <div className={styles.cardGlow} />
            <div className={styles.cardHeader}>
              <div className={styles.cardBadge}>RECOMMENDED</div>
              <h2 className={styles.cardTitle}>Complete Audit Dossier</h2>
              <p className={styles.cardSubtitle}>
                Comprehensive behavioral and reputational assessment across all linked communication and work platforms.
              </p>
            </div>

            <div className={styles.featureList}>
              <div className={styles.featureItem}>
                <svg viewBox="0 0 24 24" className={styles.checkIcon}><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span>Sentiment & tone analysis across 100% of memories</span>
              </div>
              <div className={styles.featureItem}>
                <svg viewBox="0 0 24 24" className={styles.checkIcon}><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span>Broken promises & unfulfilled commitments extraction</span>
              </div>
              <div className={styles.featureItem}>
                <svg viewBox="0 0 24 24" className={styles.checkIcon}><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span>Cryptographically verifiable PDF compliance certificate</span>
              </div>
              <div className={styles.featureItem}>
                <svg viewBox="0 0 24 24" className={styles.checkIcon}><path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span>Actionable remediation steps with risk scoring</span>
              </div>
            </div>

            <div className={styles.cardAction}>
              <button 
                className={styles.ctaButtonPrimary}
                disabled={isInitiating}
                onClick={() => handleStartAudit('full')}
              >
                {isInitiating ? 'INITIALIZING...' : 'START COMPLIANCE AUDIT'}
              </button>
            </div>
          </div>

          {/* Card 2: Specialized Reports */}
          <div className={`${styles.card} stagger-2`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardBadgeSecondary}>TARGETED</div>
              <h2 className={styles.cardTitle}>Specialized Audits</h2>
              <p className={styles.cardSubtitle}>
                Tailored analysis designed for specific high-stakes scenarios and audits.
              </p>
            </div>

            <div className={styles.specializedAudits}>
              <div className={styles.specializedItem}>
                <div>
                  <strong>Investor / Due Diligence</strong>
                  <p>Focused on financial commitments, roadmap promises, and founder credibility.</p>
                </div>
                <button 
                  className={styles.ctaButtonSecondary}
                  disabled={isInitiating}
                  onClick={() => handleStartAudit('reputation')}
                >
                  AUDIT
                </button>
              </div>

              <div className={styles.specializedItem}>
                <div>
                  <strong>Hiring & Career History</strong>
                  <p>Analyzes work ethics, collaboration health, and professional peer friction.</p>
                </div>
                <button 
                  className={styles.ctaButtonSecondary}
                  disabled={isInitiating}
                  onClick={() => handleStartAudit('hiring')}
                >
                  AUDIT
                </button>
              </div>

              <div className={styles.specializedItem}>
                <div>
                  <strong>Behavioral / Self Analysis</strong>
                  <p>Private personal feedback on tone, commitments, and communication habits.</p>
                </div>
                <button 
                  className={styles.ctaButtonSecondary}
                  disabled={isInitiating}
                  onClick={() => handleStartAudit('behavioral')}
                >
                  AUDIT
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Audit History Table */}
        {auditHistory.length > 0 && (
          <div className={`${styles.readinessFooter} stagger-5`} style={{ marginTop: '32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2px', color: 'var(--text-secondary)', marginBottom: '12px' }}>PAST AUDITS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {auditHistory.map(a => {
                const score = typeof a.riskScore === 'number' && !isNaN(a.riskScore) ? a.riskScore : 0;
                const isHigh = score > 7;
                const isMed = score > 4;
                const riskColor = isHigh ? 'var(--accent-red, #ef4444)' : isMed ? '#f59e0b' : 'var(--accent-green, #10b981)';
                return (
                  <div
                    key={a.id}
                    onClick={() => { setActiveAudit({ ...a, riskScore: score }); setAuditMode('completed'); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
                      borderRadius: '10px', cursor: 'pointer', transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-primary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)'; }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                        {a.metadata?.audit_type === 'reputation' ? 'Investor / Reputation' :
                         a.metadata?.audit_type === 'behavioral' ? 'Behavioral / Self' :
                         a.metadata?.audit_type === 'hiring' ? 'Hiring / Professional' : 'Full Reputation'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'}
                      </span>
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: riskColor }}>
                      {score.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={`${styles.readinessFooter} stagger-4`}>
          <div className={styles.readinessStatus}>
            <span className={styles.statusDot} />
            {summary
              ? `SYSTEM READY: ${summary.totalMemories.toLocaleString()} MEMORIES INDEXED`
              : 'SYSTEM READY'}
          </div>
        </div>
      </div>
    );
  }

  // 2. RUNNING / FAILED STATE — Thinking Veil
  if (auditMode === 'running') {
    // If we don't have the audit ID yet, show initializing screen
    if (!activeAudit?.id) {
      return (
        <div className={styles.auditContainer} style={{display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh'}}>
          <div style={{textAlign: 'center', color: '#a9b1d6'}}>
            <svg className={styles.spinner} viewBox="0 0 50 50" style={{width: '40px', height: '40px', margin: '0 auto 20px', animation: 'spin 2s linear infinite'}}>
              <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="90 150" strokeLinecap="round" />
            </svg>
            <h2>Initializing Audit Analysis...</h2>
            <p>Scanning your connected personal data vault...</p>
          </div>
        </div>
      );
    }

    return (
      <ThinkingVeil
        auditId={activeAudit.id}
        onComplete={async () => {
          try {
            const res = await fetch(`/api/audit/${activeAudit.id}`);
            if (res.ok) {
              const data = await res.json();
              if (data) {
                setActiveAudit({
                  ...data,
                  riskScore: typeof data.riskScore === 'number' && !isNaN(data.riskScore)
                    ? data.riskScore
                    : typeof data.risk_score === 'number' && !isNaN(data.risk_score)
                      ? data.risk_score
                      : 0,
                  mentionsCount: Number(data.mentionsCount ?? data.mentions_count ?? 0),
                  commitmentsCount: Number(data.commitmentsCount ?? data.commitments_count ?? 0),
                  metadata: data.metadata || {},
                });
              }
            }
          } catch (e) {
            console.warn('[AuditView] Could not refresh audit on complete:', e);
          }
          setAuditMode('completed');
        }}
        onError={(msg) => { setErrorMessage(msg); setAuditMode('error'); }}
        onReturnToDashboard={() => { setErrorMessage(null); setAuditMode('dashboard'); }}
      />
    );
  }

  // C2 fix: error mode renders a static ErrorBanner — no auditId polling, no infinite loop.
  if (auditMode === 'error') {
    return (
      <div className={styles.auditContainer} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: '20px' }}>
        <div style={{ textAlign: 'center', color: '#ef4444', padding: '32px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '16px', maxWidth: '440px' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '17px', color: '#ef4444' }}>Analysis Error</h2>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#9ca3af', lineHeight: 1.6 }}>
            {errorMessage || 'The audit encountered an unexpected error.'}
          </p>
          <button
            onClick={() => { setErrorMessage(null); setAuditMode('dashboard'); }}
            style={{ padding: '10px 24px', background: 'var(--text-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', letterSpacing: '0.04em' }}
          >
            RETURN TO DASHBOARD
          </button>
        </div>
      </div>
    );
  }

  // 3. COMPLETED PREVIEW
  if (auditMode === 'completed' && activeAudit) {
    const score = typeof activeAudit.riskScore === 'number' && !isNaN(activeAudit.riskScore)
      ? activeAudit.riskScore
      : typeof (activeAudit as any).risk_score === 'number' && !isNaN((activeAudit as any).risk_score)
        ? (activeAudit as any).risk_score
        : 0;

    return (
      <div className={styles.auditContainer}>
        <header className={styles.auditHeader}>
          <div>
            <h1 className={styles.auditTitle}>
              Audit Certificate: {
                activeAudit.metadata?.audit_type === 'reputation' ? 'Investor / Reputation' :
                activeAudit.metadata?.audit_type === 'behavioral' ? 'Behavioral / Self' :
                activeAudit.metadata?.audit_type === 'hiring' ? 'Hiring / Professional' :
                'Full Reputation'
              }
            </h1>
            <div className={styles.auditMeta}>
              ID: {(activeAudit.id || '').slice(0, 8).toUpperCase()} <span className={styles.metaDivider}>•</span> {activeAudit.createdAt ? new Date(activeAudit.createdAt).toUTCString() : 'Recent'}
            </div>
          </div>
          <div className={styles.headerRight}>
            <button
              className={styles.newAuditBtn}
              onClick={() => setAuditMode('dashboard')}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                <path d="M5 12h14M12 5v14" />
              </svg>
              NEW AUDIT
            </button>
          </div>
        </header>

        {/* 1. Horizontal Bento Metrics Bar */}
        <div className={`${styles.metricsGrid} stagger-1`}>
          <div className={`${styles.metricCard} magnetic-card`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Total Footprint</span>
            </div>
            <div className={styles.metricValue}>
              <AnimatedNumber value={activeAudit.mentionsCount || 0} />
            </div>
            <div className={styles.metricSubText}>Aggregated indexed mentions</div>
          </div>
          <div className={`${styles.metricCard} magnetic-card`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Sentiment Balance</span>
            </div>
            <div className={styles.metricValue}>
              <AnimatedNumber value={Math.round((activeAudit.metadata?.sentimentBalance ?? 1) * 100)} />%
            </div>
            <div className={styles.metricSubText}>Positive linguistic alignment</div>
          </div>
          <div className={`${styles.metricCard} magnetic-card`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Extracted Promises</span>
            </div>
            <div className={styles.metricValue}>
              <AnimatedNumber value={activeAudit.commitmentsCount || 0} />
            </div>
            <div className={styles.metricSubText}>Identified active commitments</div>
          </div>
        </div>

        {/* 2. Main Two-Column Layout */}
        <div className={styles.grid}>
          <div className={`${styles.mainContent} stagger-2`}>
            <section className={styles.summaryBox}>
              <div className={styles.summaryHeader}>
                <h2 className={styles.sectionHeading}>Executive Summary</h2>
                <span className={styles.summaryStatusBadge}>PREVIEW FINDINGS</span>
              </div>

              {/* Headline Narrative paragraph */}
              <div className={styles.narrative}>
                <p className={styles.headlineNarrativeText}>
                  {activeAudit.summaryNarrative || 'No narrative generated yet. Re-run analysis to generate findings.'}
                </p>
              </div>

              {/* Key Observations Grid */}
              <div className={styles.obsGrid}>
                <div className={`${styles.obsCard} magnetic-card`}>
                  <div className={styles.obsLabel}>Compliance Rate</div>
                  <div className={styles.obsValue}>
                    {activeAudit.metadata?.complianceRate ?? '—'}
                  </div>
                </div>
                <div className={`${styles.obsCard} magnetic-card`}>
                  <div className={styles.obsLabel}>Linguistic Trajectory</div>
                  <div className={styles.obsValue} style={{ textTransform: 'capitalize' }}>
                    {activeAudit.metadata?.trajectory || (score > 6 ? 'attention required' : score > 3 ? 'stable' : 'optimal')}
                  </div>
                </div>
                <div className={`${styles.obsCard} magnetic-card`}>
                  <div className={styles.obsLabel}>Tracked Signals</div>
                  <div className={styles.obsValue}>
                    <AnimatedNumber value={activeAudit.metadata?.riskFindings?.length || (score > 0 ? score * 2 + 1 : 0)} /> Identified
                  </div>
                </div>
                <div className={`${styles.obsCard} magnetic-card`}>
                  <div className={styles.obsLabel}>Behavioral Footprint</div>
                  <div className={styles.obsValue}>
                    <AnimatedNumber value={activeAudit.mentionsCount || 0} /> Scanned
                  </div>
                </div>
              </div>

              {/* Connectors Audited Tags */}
              <div className={styles.connectorsAudited}>
                <span className={styles.connectorsAuditedLabel}>Sources Covered:</span>
                {(activeAudit.connectorsCovered || []).length > 0 ? (
                  activeAudit.connectorsCovered.map((c, i) => (
                    <span key={i} className={styles.connectorPill}>{c}</span>
                  ))
                ) : (
                  <span className={styles.connectorPillNone}>Vault Data Only</span>
                )}
              </div>

              {/* Lock banner — only show if no PDF has been generated yet */}
              {!activeAudit.reportUrl && (
                <div className={styles.lockedContainer}>
                  <div className={styles.lockedHeader}>
                    <strong>SECURE REPORT ACCESS REQUIRED</strong>
                  </div>
                  <p className={styles.lockedText}>
                    Full behavioral analysis, cross-platform source citations, exact context logs, and complete risk scoring breakdown are sealed. Download the verified cryptographic PDF report to view full findings.
                  </p>
                </div>
              )}
            </section>
          </div>

          <aside className={`${styles.sidebarCard} stagger-3`}>
            <div className={styles.sidebarSectionTitle}>RISK PROFILE</div>
            {/* Minimalist Single Gauge Chart */}
            {(() => {
              const isCritical = score > 7;
              const isModerate = score > 4;
              const riskColor = isCritical ? 'var(--accent-red)' : isModerate ? '#f59e0b' : 'var(--accent-green)';

              // Metric values 0–1
              const promiseVal = score > 7 ? 0.72 : score > 4 ? 0.85 : 0.96;
              const sentimentVal = Math.min(1, Math.max(0, (activeAudit.metadata?.sentimentBalance ?? 1)));
              const safetyVal = Math.min(1, Math.max(0, (10 - score) / 10));

              const riskFraction = Math.min(1, Math.max(0, score / 10));
              const circumference = 2 * Math.PI * 60;

              return (
                <div className={styles.singleGaugeContainer}>
                  <div className={styles.gaugeCenter}>
                    <svg className={styles.gaugeSvg} width="160" height="160" viewBox="0 0 160 160">
                      <defs>
                        <filter id="glowSingle">
                          <feGaussianBlur stdDeviation="4" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>

                      {/* Background Track */}
                      <circle 
                        className={styles.singleRingTrack} 
                        cx="80" cy="80" r="60" 
                        transform="rotate(-90 80 80)" 
                      />
                      
                      {/* Active Fill */}
                      <circle 
                        className={styles.singleRingFill} 
                        cx="80" cy="80" r="60"
                        stroke={riskColor}
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - riskFraction)}
                        transform="rotate(-90 80 80)"
                        filter="url(#glowSingle)" 
                      />
                    </svg>
                    <div className={styles.gaugeScore}>
                      <span className={styles.scoreNumber} style={{ color: riskColor }}>
                        {score.toFixed(1)}
                      </span>
                      <span className={styles.scoreText}>RISK SCORE</span>
                    </div>
                  </div>

                  {/* 3-Column Minimal Grid */}
                  <div className={styles.minimalGrid}>
                    <div className={styles.minimalGridItem}>
                      <span className={styles.gridVal}>{Math.round(promiseVal * 100)}%</span>
                      <span className={styles.gridLabel}>Commitments</span>
                      <div className={styles.gridBar}><div className={styles.gridBarFill} style={{ width: `${promiseVal * 100}%`, background: riskColor }}/></div>
                    </div>
                    <div className={styles.minimalGridItem}>
                      <span className={styles.gridVal}>{Math.round(sentimentVal * 100)}%</span>
                      <span className={styles.gridLabel}>Sentiment</span>
                      <div className={styles.gridBar}><div className={styles.gridBarFill} style={{ width: `${sentimentVal * 100}%`, background: riskColor }}/></div>
                    </div>
                    <div className={styles.minimalGridItem}>
                      <span className={styles.gridVal}>{Math.round(safetyVal * 100)}%</span>
                      <span className={styles.gridLabel}>Mentions</span>
                      <div className={styles.gridBar}><div className={styles.gridBarFill} style={{ width: `${safetyVal * 100}%`, background: riskColor }}/></div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className={styles.sidebarActions}>
              <button
                className={styles.downloadBtnPremium}
                disabled={isDownloading}
                onClick={async () => {
                  if (!activeAudit?.id) return;
                  setPdfError(null);
                  setIsDownloading(true);
                  try {
                    const supabase = createClient();
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`/api/audit/${activeAudit.id}/pdf`, {
                      headers: {
                        'Authorization': `Bearer ${session?.access_token || ''}`
                      }
                    });
                    if (!res.ok) throw new Error('PDF generation failed. Please try again.');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `eyes-audit-${activeAudit.id.slice(0, 8)}.pdf`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                  } catch (err) {
                    console.error('[PDF Download] failed:', err);
                    setPdfError(err instanceof Error ? err.message : 'PDF generation failed.');
                  } finally {
                    setIsDownloading(false);
                  }
                }}
              >
                {isDownloading ? (
                  <span className={styles.downloadSpinnerWrapper}>
                    <svg className={styles.spinner} viewBox="0 0 50 50">
                      <circle className={styles.path} cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle>
                    </svg>
                    COMPILING PDF...
                  </span>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                    DOWNLOAD DOSSIER PDF
                  </>
                )}
              </button>

              {/* Inline PDF error — replaces alert() */}
              {pdfError && (
                <p style={{ fontSize: '0.75rem', color: 'var(--accent-red, #ef4444)', marginTop: '6px', lineHeight: 1.4 }}>
                  {pdfError}
                </p>
              )}

              {/* Inline rerun confirm — replaces window.confirm() */}
              {rerunConfirming ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '10px' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Re-run the AI analysis? This refreshes all findings, commitments, and risk scores.
                  </p>
                  {rerunError && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--accent-red, #ef4444)', margin: 0 }}>{rerunError}</p>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      style={{ flex: 1, background: 'var(--text-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: '6px', padding: '7px', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.5px' }}
                      onClick={async () => {
                        if (!activeAudit?.id) return;
                        setRerunError(null);
                        try {
                          const res = await fetch(`/api/audit/${activeAudit.id}/reanalyze`, { method: 'POST' });
                          if (!res.ok) {
                            const errData = await res.json().catch(() => ({}));
                            throw new Error(errData.detail || errData.error || 'Failed to start re-analysis');
                          }
                          setActiveAudit(prev => prev ? { ...prev, status: 'pending' } : null);
                          setErrorMessage(null);
                          setRerunConfirming(false);
                          setAuditMode('running');
                        } catch (err) {
                          console.error('[Reanalyze] failed:', err);
                          setRerunError(err instanceof Error ? err.message : 'Failed to start re-analysis.');
                        }
                      }}
                    >
                      CONFIRM
                    </button>
                    <button
                      style={{ flex: 1, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '7px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                      onClick={() => { setRerunConfirming(false); setRerunError(null); }}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className={styles.rerunBtnPremium}
                  onClick={() => setRerunConfirming(true)}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                  </svg>
                  RE-RUN ANALYSIS
                </button>
              )}
            </div>
          </aside>
        </div>

      </div>
    );
  }

  return null;
}