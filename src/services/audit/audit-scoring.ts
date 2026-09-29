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

/**
 * Detects automated security notifications, routine system alerts, OAuth logins, and resumes
 * to exclude them from reputation risk extraction and scoring.
 */
export function isRoutineNotificationOrSystemEmail(item: { title?: string | null; content?: string | null; author?: string | null }): boolean {
  const text = `${item.title ?? ''} ${item.content ?? ''} ${item.author ?? ''}`.toLowerCase();

  // 1. Security alerts & authentication notifications
  if (
    text.includes('new sign-in') ||
    text.includes('new login') ||
    text.includes('signed in from') ||
    text.includes('unrecognized device') ||
    text.includes('security alert') ||
    text.includes('login notification') ||
    text.includes('login alert') ||
    text.includes('password reset') ||
    text.includes('password changed') ||
    text.includes('verification code') ||
    text.includes('verify your email') ||
    text.includes('confirm your email') ||
    text.includes('one-time code') ||
    text.includes('one-time password') ||
    text.includes('two-factor') ||
    text.includes('2-step verification') ||
    text.includes('2fa') ||
    text.includes('security code') ||
    text.includes('account recovery') ||
    text.includes('account alert')
  ) {
    return true;
  }

  // 2. OAuth authorizations, account connections & third-party data sharing
  if (
    text.includes('data shared with') ||
    text.includes('account data shared') ||
    text.includes('granted access to') ||
    text.includes('has access to your') ||
    text.includes('connected your account') ||
    text.includes('authorized app') ||
    text.includes('authorized application') ||
    text.includes('oauth') ||
    text.includes('third-party app') ||
    text.includes('connected to slack') ||
    text.includes('connected to google') ||
    text.includes('google account access') ||
    text.includes('permissions granted')
  ) {
    return true;
  }

  // 3. Resumes, CVs, and standard job application submissions
  if (
    text.includes('resume') ||
    text.includes('curriculum vitae') ||
    text.includes('job application') ||
    text.includes('application received') ||
    text.includes('applied for') ||
    text.includes('cover letter') ||
    text.includes('candidate submission')
  ) {
    return true;
  }

  // 4. Automated transactional / system noise
  if (
    text.includes('no-reply@') ||
    text.includes('noreply@') ||
    text.includes('notifications@') ||
    text.includes('mailer-daemon@') ||
    text.includes('automated notification') ||
    text.includes('terms of service update') ||
    text.includes('privacy policy update') ||
    text.includes('shipping update') ||
    text.includes('order confirmation')
  ) {
    return true;
  }

  return false;
}

/**
 * Filters out false positive risk findings that are routine system/account operations
 * rather than genuine reputation risks (conflicts, broken commitments, harassment, etc).
 */
export function isFalsePositiveRiskFinding(findingText: string): boolean {
  const f = (findingText || '').toLowerCase();
  return (
    f.includes('sign-in') ||
    f.includes('login') ||
    f.includes('signed in') ||
    f.includes('security alert') ||
    f.includes('security notification') ||
    f.includes('password reset') ||
    f.includes('verification code') ||
    f.includes('data shared with') ||
    f.includes('account data shared') ||
    f.includes('oauth') ||
    f.includes('app connected') ||
    f.includes('app authorization') ||
    f.includes('resume') ||
    f.includes('curriculum vitae') ||
    f.includes('baseline neutral') ||
    f.includes('neutral communication') ||
    f.includes('sibling lens') ||
    f.includes('lens analysis') ||
    f.includes('cross-lens')
  );
}
