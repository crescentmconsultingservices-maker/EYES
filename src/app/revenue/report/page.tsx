'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { generateReportAction } from '../actions';

export default function FullReportPage() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get('scan_id');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!scanId) {
      setErrorMsg('No scan ID provided.');
      setLoading(false);
      return;
    }

    const fetchReport = async () => {
      try {
        const res = await generateReportAction(scanId);
        if (res.error) throw new Error(res.error);
        if (res.no_leaks) throw new Error('No leaks found for this scan.');
        setReport(res.report);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to load report.');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [scanId]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <div>Loading full report...</div>
        </div>
      </div>
    );
  }

  if (errorMsg || !report) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer} style={{ color: 'var(--alert)' }}>
          {errorMsg || 'Report not found.'}
        </div>
      </div>
    );
  }

  const getTagClass = (type: string) => {
    switch (type) {
      case 'OPEN_PROPOSAL': return styles.tagOp;
      case 'GHOSTED_CLIENT': return styles.tagGc;
      case 'DROPPED_COMMITMENT': return styles.tagDc;
      case 'UNANSWERED_INBOUND': return styles.tagUi;
      default: return '';
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.band}>
        <div className={styles.bandL}>EYES — Revenue Leak Scan</div>
        <div className={styles.bandR}>Confidential · Prepared for client</div>
      </div>

      <div className={styles.titleblock}>
        <div className={styles.kicker}>Full Report · Paid Tier</div>
        <h1 className={styles.title}>What your inbox has been<br />quietly losing.</h1>
        <div className={styles.clientline}>
          PREPARED FOR &nbsp;<b>User {report.user_id.split('-')[0]}</b><br />
          WINDOW &nbsp;<b>Past 182 days</b><br />
          DELIVERED &nbsp;<b>{new Date().toLocaleDateString()}</b>
        </div>
      </div>

      <div className={styles.summary}>
        <div className={styles.cell}><div className={`${styles.num} ${styles.numHot}`}>{report.summary.threads_flagged}</div><div className={styles.lab}>Threads flagged</div></div>
        <div className={styles.cell}><div className={`${styles.num} ${styles.numHot}`}>€{(report.summary.total_value_eur / 1000).toFixed(0)}k</div><div className={styles.lab}>Est. pipeline value</div></div>
        <div className={styles.cell}><div className={styles.num}>{report.summary.total_threads_scanned || '...'}</div><div className={styles.lab}>Threads scanned</div></div>
        <div className={styles.cell}><div className={styles.num}>{report.summary.oldest_leak_age_days}d</div><div className={styles.lab}>Oldest leak age</div></div>
      </div>

      <section className={styles.section}>
        <div className={styles.ruleH2}><span className={styles.ruleH2N}>§1</span><h2 className={styles.h2}>How to read this report</h2></div>
        <p className={styles.p}>Every claim in this document carries its receipt. Nothing here is generated, estimated from patterns, or inferred from industry averages — each flagged thread cites the exact email it came from, with sender, date, and the line that mattered.</p>
      </section>

      <section className={styles.section}>
        <div className={styles.ruleH2}><span className={styles.ruleH2N}>§2</span><h2 className={styles.h2}>The prioritized recovery list</h2></div>
        <p className={`${styles.p} ${styles.soft}`}>Ranked by estimated value × recoverability. Work from the top.</p>
        <table className={styles.table}>
          <thead><tr><th>#</th><th>Type</th><th>Counterparty</th><th>Last activity</th><th>Silent</th><th>Est. value</th><th>Receipt</th></tr></thead>
          <tbody>
            {report.leaks.map((leak: any, idx: number) => (
              <tr key={idx}>
                <td className={styles.rank}>{(idx + 1).toString().padStart(2, '0')}</td>
                <td><span className={`${styles.tag} ${getTagClass(leak.leak_type)}`}>{leak.leak_type}</span></td>
                <td>{leak.counterparty_domain || leak.counterparty_name || 'Unknown'}</td>
                <td>{new Date(leak.last_activity_date).toLocaleDateString()}</td>
                <td className={styles.days}>{leak.days_silent}d</td>
                <td className={styles.val}>€{leak.est_value_eur}</td>
                <td className={styles.rcptRef}>R-{(idx + 1).toString().padStart(2, '0')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section}>
        <div className={styles.ruleH2}><span className={styles.ruleH2N}>§3</span><h2 className={styles.h2}>Receipts &amp; recovery drafts</h2></div>

        {report.leaks.map((leak: any, idx: number) => (
          <div key={idx} className={styles.leak}>
            <div className={styles.leakHead}>
              <span className={styles.leakId}>LEAK {(idx + 1).toString().padStart(2, '0')} · R-{(idx + 1).toString().padStart(2, '0')} · {leak.leak_type}</span>
              <span className={styles.leakWorth}>est. €{leak.est_value_eur}</span>
            </div>
            <div className={styles.leakBody}>
              <h3>{leak.counterparty_domain || leak.counterparty_name || 'Unknown Client'}</h3>
              <p className={styles.leakWhy}>{leak.evidence.context_summary}</p>
              
              <div className={styles.receipt}>
                <span className={styles.rmeta}>RECEIPT R-{(idx + 1).toString().padStart(2, '0')}</span><br/>
                <span className={styles.rl}>Date:</span> {new Date(leak.last_activity_date).toLocaleDateString()}<br/>
                <span className={styles.rq}>"{leak.evidence.quoted_line}"</span>
              </div>

              <div className={styles.recovery}>
                <div className={styles.rt}>Suggested Action Angle</div>
                <p>{leak.recovery_angle}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className={styles.docfoot}>
        <span>Revenue Leak Scan · Full</span>
        <span>EYES — Everything You Ever Said</span>
      </div>
    </div>
  );
}
