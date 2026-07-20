'use client';

import React, { useState } from 'react';
import styles from './page.module.css';
import { triggerScanAction, detectScanAction, generateReportAction } from './actions';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function RevenueScanPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'ingest' | 'detect' | 'report' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [report, setReport] = useState<any>(null);
  
  // Progress tracking for long scans
  const [detectProgress, setDetectProgress] = useState(0);
  const [totalEligible, setTotalEligible] = useState(0);
  
  const [useMock, setUseMock] = useState(true);

  // Default to real user ID if logged in, otherwise fallback to local test ID
  const [userIdInput, setUserIdInput] = useState('4d2f3e3c-b834-43fc-852a-c3cdbb535b68');
  
  React.useEffect(() => {
    if (user?.id) {
      setUserIdInput(user.id);
      setUseMock(false); // If they are logged in, default to trying their real inbox!
    }
  }, [user]);

  const startScan = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      setPhase('ingest');

      // 1. Ingest
      const ingestRes = await triggerScanAction(userIdInput, useMock);
      const scanId = ingestRes.manifest.scan_id;
      
      setTotalEligible(ingestRes.manifest.threads_eligible);
      
      if (ingestRes.manifest.threads_eligible === 0) {
        setPhase('done');
        setReport({ empty: true, message: 'No eligible threads found in the past 182 days.' });
        setLoading(false);
        return;
      }

      // 2. Detect
      setPhase('detect');
      let hasMore = true;
      let processedSoFar = 0;
      while (hasMore) {
        const detectRes = await detectScanAction(scanId);
        if (detectRes.message === 'All threads processed') {
          hasMore = false;
        } else {
          processedSoFar += (detectRes.processed || 0);
          setDetectProgress(processedSoFar);
          hasMore = detectRes.has_more;
        }
      }

      // 3. Generate Report
      setPhase('report');
      const reportRes = await generateReportAction(scanId);
      
      if (reportRes.no_leaks) {
        setReport({ empty: true, message: 'Scan complete. No revenue leaks found!' });
      } else {
        setReport(reportRes.report);
      }
      
      setPhase('done');

    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.band}>
        <div className={styles.bandL}>EYES — Revenue Leak Scan</div>
        <div className={styles.bandR}>Free Preview</div>
      </div>

      {phase === 'idle' && (
        <>
          <div className={styles.titleblock}>
            <div className={styles.kicker}>Stop losing money in plain sight</div>
            <h1 className={styles.title}>Audit your inbox for <br /> dropped revenue.</h1>
            <div className={styles.clientline}>
              We connect securely to your Gmail. We analyze the last <b>182 days</b> of threads. We find the deals you forgot to close.
            </div>
          </div>

          <div style={{ marginTop: '30px' }}>
             <label style={{ display: 'block', marginBottom: '8px', fontFamily: 'monospace', fontSize: '12px', color: '#5C554B' }}>TEST USER ID (Local Dev):</label>
             <input 
                type="text" 
                value={userIdInput} 
                onChange={(e) => setUserIdInput(e.target.value)}
                style={{ width: '100%', padding: '12px', marginBottom: '12px', border: '1px solid #E2D8C8', background: '#FDFAF4', fontFamily: 'monospace' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontFamily: 'monospace', fontSize: '12px', color: '#5C554B', cursor: 'pointer' }}>
                <input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} />
                USE MOCK DATA (Bypass Gmail API to test AI pipeline)
              </label>
            <button className={styles.btn} onClick={startScan}>Scan My Inbox Now</button>
          </div>

          <div className={styles.gdpr}>
            <div className={styles.gdprGt}>Data handling — plain language</div>
            <p>Read-only access via OAuth, revocable by you at any time from your Google Account. Processed entirely on EU servers (Frankfurt). Deleted within 7 days unless you continue to monitoring. Never used to train models, never mined, never shared. EYES SAS, Rennes, France — GDPR-native by design.</p>
          </div>
        </>
      )}

      {loading && (
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <div className={styles.loadingStatus}>
            {phase === 'ingest' && 'Fetching email threads...'}
            {phase === 'detect' && `AI is analyzing threads for leaks... (${Math.min(detectProgress, totalEligible)} / ${totalEligible})`}
            {phase === 'report' && 'Generating final report...'}
          </div>
          <div className={styles.loadingSub}>This usually takes about 60 seconds. Please do not close this window.</div>
        </div>
      )}

      {phase === 'error' && (
        <div className={styles.loadingContainer}>
          <div className={styles.loadingStatus} style={{ color: '#A63D2F' }}>Scan Failed</div>
          <div className={styles.loadingSub}>{errorMsg}</div>
          <button className={styles.btn} style={{ marginTop: '24px' }} onClick={() => setPhase('idle')}>Try Again</button>
        </div>
      )}

      {phase === 'done' && report && report.empty && (
        <div className={styles.loadingContainer}>
          <div className={styles.loadingStatus}>Audit Complete</div>
          <div className={styles.loadingSub}>{report.message}</div>
          <button className={styles.btn} style={{ marginTop: '24px' }} onClick={() => setPhase('idle')}>Start Over</button>
        </div>
      )}

      {phase === 'done' && report && !report.empty && (
        <>
          <div className={styles.titleblock}>
            <div className={styles.kicker}>Scan complete — here is your number</div>
            <h1 className={styles.title}>Your inbox is holding money<br/>you can't see.</h1>
            <div className={styles.clientline}>
              WINDOW &nbsp;<b>182 days</b> &nbsp;·&nbsp; SCANNED &nbsp;<b>{report.manifest?.threads_eligible || 0} threads</b>
            </div>
          </div>

          <div className={styles.hero}>
            <div className={styles.heroBig}>€{(report.summary.total_value_eur / 1000).toFixed(0)}k</div>
            <div className={styles.heroSub}>
              estimated pipeline value sitting in <b>{report.summary.threads_flagged} threads</b> that went silent without a decision — at your stated average fee of €7,000 per placement.
            </div>
          </div>

          <div className={styles.tiles}>
            <div className={styles.tile}><div className={styles.tileN}>{report.summary.counts.OPEN_PROPOSAL || 0}</div><div className={styles.tileT}>Open proposals never chased</div></div>
            <div className={styles.tile}><div className={styles.tileN}>{report.summary.counts.GHOSTED_CLIENT || 0}</div><div className={styles.tileT}>Clients gone quiet — no rejection</div></div>
            <div className={styles.tile}><div className={styles.tileN}>{report.summary.counts.DROPPED_COMMITMENT || 0}</div><div className={styles.tileT}>Commitments made, not closed</div></div>
            <div className={styles.tile}><div className={styles.tileN}>{report.summary.counts.UNANSWERED_INBOUND || 0}</div><div className={styles.tileT}>Inbound requests never answered</div></div>
          </div>

          <section className={styles.section}>
            <h2 className={styles.h2}>Top receipts, so you know it's real.</h2>
            <p className={styles.soft}>These are your emails. Every flagged thread in the full report carries a receipt exactly like these.</p>

            {report.leaks.slice(0, 3).map((leak: any, idx: number) => (
              <div key={idx} className={styles.receipt}>
                <span className={styles.receiptRmeta}>{leak.leak_type} · est. €{leak.est_value_eur} · silent {leak.days_silent} days</span><br/>
                {leak.counterparty_name && <><span className={styles.receiptRl}>From:</span> {leak.counterparty_name} · {new Date(leak.last_activity_date).toLocaleDateString()}<br/></>}
                <span className={styles.receiptRq}>"{leak.evidence.quoted_line}"</span><br/>
                <span className={styles.receiptRl}>— {leak.evidence.context_summary}</span>
              </div>
            ))}
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>The other {Math.max(0, report.summary.threads_flagged - 3)} threads.</h2>
            <div className={styles.locked}>
              
              {/* Dynamically render the real remaining leaks, but keep them blurred out */}
              {report.leaks.slice(3, 8).map((leak: any, i: number) => (
                 <div key={i} className={styles.lockrow}>
                    <span>0{i+4}</span>
                    <span>{leak.leak_type}</span>
                    <span>{leak.counterparty_domain || leak.counterparty_name || 'Client Domain Hidden'}</span>
                    <span>€{leak.est_value_eur}</span>
                    <span>{leak.days_silent}d silent</span>
                 </div>
              ))}
              
              <div className={styles.lockshade}><div className={styles.lockshadeMsg}>Unlocked in the full report</div></div>
            </div>

            <div className={styles.cta}>
              <h3>Full report — €250, delivered within 48 hours.</h3>
              <ul>
                <li>All {report.summary.threads_flagged} threads, itemized and ranked by value × recoverability</li>
                <li>The receipt for every single claim — sender, date, exact line</li>
                <li>A drafted, ready-to-send recovery email for each thread</li>
                <li>One recovered placement pays for this report ~28 times over</li>
              </ul>
              <button className={styles.btn} onClick={() => router.push(`/revenue/report?scan_id=${report.scan_id}`)}>Unlock the full report — €250</button>
              <div className={styles.ctaFine}>One-time payment · Report delivered as PDF · Your scan data is deleted 7 days after delivery.</div>
            </div>
          </section>
          
          <div className={styles.docfoot} style={{ marginTop: '50px' }}>
            <span>Revenue Leak Scan · Preview</span>
            <span>EYES — Everything You Ever Said</span>
          </div>
        </>
      )}
    </div>
  );
}
