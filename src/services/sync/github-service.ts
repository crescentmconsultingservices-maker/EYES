import { SupabaseClient } from '@supabase/supabase-js';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidGithubToken } from '@/services/auth/oauth';
import { scoreGithubEvent } from '@/utils/risk/scorer';
import { type SyncActor } from '@/utils/sync/actor';

type GitHubRepo = {
  id: number;
  full_name: string;
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
  updated_at: string;
};

function formatDate(input: string | null) {
  if (!input) return new Date().toISOString();
  return new Date(input).toISOString();
}

export async function executeGithubSync(actor: SyncActor, mode: string = 'delta') {
  const { supabase, userId, userEmail, userName } = actor;

  // --- DATA LOCKDOWN GUARD ---
  const { data: activeAudit } = await supabase
    .from('reputation_audits')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'analysis', 'generating'])
    .maybeSingle();

  if (activeAudit) {
    return { status: 423, error: 'System Busy: Reputation Audit in progress.', detail: 'Ingestion is paused.' };
  }

  // 1. Get existing sync status to find the current page cursor
  const { data: currentStatus } = await supabase
    .from('sync_status')
    .select('cursor, total_items')
    .eq('user_id', userId)
    .eq('platform', 'github')
    .maybeSingle();

  let accessToken: string | null = null;
  try {
    accessToken = await getValidGithubToken(supabase, userId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('github sync auth error:', detail);
    return { status: 401, error: 'GitHub authentication failed.', detail };
  }

  if (!accessToken) {
    return { status: 401, error: 'GitHub is not connected yet.' };
  }

  const isBackfill = mode === 'backfill';
  const perPage = 100;
  const maxTotal = isBackfill ? Infinity : 100;

  await upsertSyncStatusSafely(supabase, {
    user_id: userId,
    platform: 'github',
    status: 'syncing',
    last_sync_at: new Date().toISOString(),
  });

  let allRepos: GitHubRepo[] = [];
  let page = parseInt(currentStatus?.cursor || '1');
  let hasMore = true;

  while (allRepos.length < maxTotal && hasMore) {
    const repoResponse = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'EYES-Memory-Engine',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });

    if (!repoResponse.ok) {
      if (repoResponse.status === 401 || repoResponse.status === 403) {
        const detail = await repoResponse.text();
        throw new Error(`GitHub auth failed: ${repoResponse.status} ${detail}`);
      }
      hasMore = false;
      break;
    }

    const repos = (await repoResponse.json()) as GitHubRepo[];
    if (!repos || repos.length === 0) {
      hasMore = false;
      break;
    }

    allRepos = [...allRepos, ...repos];
    page += 1;
    if (repos.length < perPage) {
      hasMore = false;
      break;
    }
  }

  const now = new Date().toISOString();

  const { getPrivacyExclusions } = await import('@/utils/privacy/filter');
  const excludedRepos = await getPrivacyExclusions(supabase, userId, 'github', 'github_repo');

  const rawEventsRaw = await Promise.all(allRepos.map(async (repo) => {
    // Privacy Shield: Drop excluded repositories
    if (excludedRepos.has(repo.full_name.toLowerCase()) || excludedRepos.has(repo.name.toLowerCase())) {
      return null;
    }

    const description = repo.description || 'No description provided.';
    const content = [
      description,
      `Language: ${repo.language || 'Unknown'}`,
      `Stars: ${repo.stargazers_count} | Forks: ${repo.forks_count}`,
      `Repo: ${repo.html_url}`,
    ].join(' ');

    const risk = await scoreGithubEvent({
      title: repo.full_name,
      description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
    });

    return {
      user_id: userId,
      platform: 'github',
      platform_id: String(repo.id),
      event_type: 'repository',
      title: repo.full_name,
      content,
      author: userEmail || userName || 'GitHub',
      timestamp: formatDate(repo.updated_at || repo.pushed_at),
      metadata: {
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        pushed_at: repo.pushed_at,
        updated_at: repo.updated_at,
        risk_score: risk.score,
        risk_factors: risk.reasons,
      },
      is_flagged: risk.flagged,
      flag_severity: risk.severity,
      flag_reason: risk.reasons[0] || null,
    };
  }));

  const rawEvents = rawEventsRaw.filter(Boolean) as any[];

  await upsertRawEventsSafely(supabase, rawEvents);
  console.log(`[GitHub Sync] Upserted ${rawEvents.length} events for user ${userId}`);

  await Promise.all([
    upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'github',
      status: hasMore ? 'syncing' : 'connected',
      sync_progress: hasMore ? 60 : 100,
      total_items: (currentStatus?.total_items || 0) + rawEvents.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      cursor: hasMore ? String(page) : null,
      error_message: null,
    }),
    supabase.from('user_profiles').update({
      memories_indexed: (currentStatus?.total_items || 0) + rawEvents.length,
      updated_at: now,
    }).eq('user_id', userId),
  ]);

  return {
    status: 200,
    data: {
      ok: true,
      syncedRepos: rawEvents.length,
      hasMore,
    }
  };
}
