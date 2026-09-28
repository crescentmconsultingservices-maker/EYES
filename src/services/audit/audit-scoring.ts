import { Commitment } from '@/types/dashboard';

/**
 * Cross-references extracted commitments against Google Calendar events
 * to determine if a commitment was actually fulfilled.
 * A commitment is considered 'completed' if a calendar event was created
 * within 7 days of the commitment date with overlapping keywords.
 */
export async function resolveCommitmentStatuses(
  commitments: Commitment[],
  calendarEvents: Array<{ title: string | null; timestamp: string | null }>
): Promise<Commitment[]> {
  if (calendarEvents.length === 0) return commitments;

  return commitments.map(commitment => {
    const commitmentDate = new Date(commitment.date).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Extract key words from the commitment text (3+ char words)
    const commitmentWords = commitment.text
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length >= 3);

    // Look for a calendar event created within 7 days of the commitment
    // that shares at least 2 keywords with the commitment text
    const hasFulfillingEvent = calendarEvents.some(evt => {
      if (!evt.timestamp || !evt.title) return false;
      const evtDate = new Date(evt.timestamp).getTime();
      const withinWindow = Math.abs(evtDate - commitmentDate) <= sevenDaysMs;
      if (!withinWindow) return false;

      const evtWords = evt.title.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
      const matchingWords = commitmentWords.filter(w => evtWords.includes(w));
      return matchingWords.length >= 2;
    });

    return {
      ...commitment,
      status: hasFulfillingEvent ? 'completed' : 'pending',
    };
  });
}

/**
 * Computes a time-decay weight for a memory record.
 * Recent (< 30 days): 1.0 | Semi-recent (< 6 months): 0.5 | Older: 0.2
 */
export function computeRecencyWeight(timestampIso: string, nowTs: number): number {
  const ageMs = nowTs - new Date(timestampIso).getTime();
  const THIRTY_DAYS_MS  = 30  * 24 * 60 * 60 * 1000;
  const SIX_MONTHS_MS   = 180 * 24 * 60 * 60 * 1000;
  return ageMs < THIRTY_DAYS_MS ? 1.0 : ageMs < SIX_MONTHS_MS ? 0.5 : 0.2;
}
