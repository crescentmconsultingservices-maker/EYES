'use server';

// Ensure it strictly uses localhost during local development to avoid hitting production Vercel where these routes don't exist yet
const SERVER_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:3000' 
  : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
const CRON_SECRET = process.env.CRON_SECRET;

export async function triggerScanAction(userId: string, mock: boolean = false) {
  const res = await fetch(`${SERVER_URL}/api/revenue/trigger`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`
    },
    body: JSON.stringify({ user_id: userId, client_stated_fee: 7000, mock }),
    // Important: Don't cache POST requests in server actions
    cache: 'no-store'
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Trigger failed: ${errorText}`);
  }

  return res.json();
}

export async function detectScanAction(scanId: string) {
  const res = await fetch(`${SERVER_URL}/api/revenue/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`
    },
    body: JSON.stringify({ scan_id: scanId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Detect failed: ${errorText}`);
  }

  return res.json();
}

export async function generateReportAction(scanId: string) {
  const res = await fetch(`${SERVER_URL}/api/revenue/generate-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`
    },
    body: JSON.stringify({ scan_id: scanId }),
    cache: 'no-store'
  });

  if (!res.ok) {
    // 404 means no leaks found, we can handle this gracefully
    if (res.status === 404) return { no_leaks: true };
    const errorText = await res.text();
    throw new Error(`Report failed: ${errorText}`);
  }

  return res.json();
}
