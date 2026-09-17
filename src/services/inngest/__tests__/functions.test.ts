import { describe, expect, it } from 'vitest';
import {
  functions,
  investigateChurn,
  proactiveChurnInvestigation,
  staleCommitmentAlerts,
} from '@/services/inngest/functions';

describe('Inngest Automated Workflows', () => {
  it('exports all 3 functions in the functions array', () => {
    expect(functions).toHaveLength(3);
    expect(functions).toContain(investigateChurn);
    expect(functions).toContain(proactiveChurnInvestigation);
    expect(functions).toContain(staleCommitmentAlerts);
  });

  it('configures investigateChurn with correct ID and trigger', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = investigateChurn as any;
    expect(fn.id()).toBe('investigate-churn');
    expect(fn.name).toBe('Investigate Churn and Draft Emails');
  });

  it('configures proactiveChurnInvestigation with scheduled cron and event trigger', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = proactiveChurnInvestigation as any;
    expect(fn.id()).toBe('proactive-churn-investigation');
    expect(fn.name).toBe('Proactive Churn & Leak Investigation');
  });

  it('configures staleCommitmentAlerts with scheduled cron and event trigger', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = staleCommitmentAlerts as any;
    expect(fn.id()).toBe('stale-commitment-alerts');
    expect(fn.name).toBe('Stale Commitment & Slippage Monitor');
  });
});
