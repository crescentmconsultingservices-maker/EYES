export function isMissingTable(errorCode?: string) {
  // Postgres error code 42P01 = undefined_table
  return errorCode === '42P01';
}

export function parseResponsePayload(rawBody: string) {
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return { message: rawBody.slice(0, 300) };
  }
}

export function resolveBaseUrl(request: Request) {
  // If we are on localhost, always use relative or local origin to avoid hitting production
  const host = request.headers.get('host');
  if (host) {
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return \`\${protocol}://\${host}\`;
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\\/$/, '');
  }

  return new URL(request.url).origin;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const xSecret = request.headers.get('x-cron-secret');
  if (xSecret) return xSecret.trim();

  const url = new URL(request.url);
  return url.searchParams.get('secret')?.trim() || null;
}

export function isAuthorizedCron(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return false;
  }

  const providedSecret = getCronSecret(request);
  return !!providedSecret && providedSecret === expectedSecret;
}

export function toLogStatus(success: boolean, attempted = true): 'success' | 'error' | 'skipped' {
  if (!attempted) {
    return 'skipped';
  }

  return success ? 'success' : 'error';
}

export function toIsoFromNowMinusDuration(durationMs: number) {
  return new Date(Date.now() - Math.max(0, durationMs)).toISOString();
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);

  return results;
}
