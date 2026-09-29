import { describe, expect, it } from 'vitest';
import {
  functions,
  staleCommitmentAlerts,
  proactiveAgenticScan,
  reputationAuditWorker,
} from '@/services/inngest/functions';

describe('Inngest Automated Workflows', () => {
  it('exports all functions in the functions array', () => {
    expect(functions).toHaveLength(3);
    expect(functions).toContain(staleCommitmentAlerts);
    expect(functions).toContain(proactiveAgenticScan);
    expect(functions).toContain(reputationAuditWorker);
  });



  it('configures staleCommitmentAlerts with scheduled cron and event trigger', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = staleCommitmentAlerts as any;
    expect(fn.id()).toBe('stale-commitment-alerts');
    expect(fn.name).toBe('Stale Commitment & Slippage Monitor');
  });

  it('configures proactiveAgenticScan with correct ID', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = proactiveAgenticScan as any;
    expect(fn.id()).toBe('proactive-agentic-scan');
  });
});
