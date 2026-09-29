import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/actions/queue
 * Returns pending actions from DB instantly — no AI call.
 * The UI loads this on mount for zero-latency display.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userIds = [user.id];

    // Run queries
    const [actionsRes, logRes, recentRes, platformRes] = await Promise.all([
      supabase
        .from('action_queue')
        .select('*')
        .in('user_id', userIds)
        .in('status', ['pending', 'PENDING'])
        .order('confidence', { ascending: false })
        .order('extracted_at', { ascending: false })
        .limit(50),

      supabase
        .from('action_extraction_log')
        .select('last_run_at, memory_count')
        .in('user_id', userIds)
        .order('last_run_at', { ascending: false })
        .maybeSingle(),

      // Last 5 approved or dismissed actions for the "Recently Handled" log
      supabase
        .from('action_queue')
        .select('id, platform, title, status, executed_at, extracted_at')
        .in('user_id', userIds)
        .in('status', ['approved', 'dismissed', 'executed', 'APPROVED', 'DISMISSED', 'EXECUTED'])
        .order('executed_at', { ascending: false })
        .limit(5),

      // Platform memory counts for the scan stats
      supabase
        .from('memories')
        .select('platform')
        .in('user_id', userIds)
        .in('platform', ['gmail', 'google-calendar', 'github', 'linear', 'trello', 'slack', 'notion', 'discord'])
        .limit(5000),
    ]);

    if (actionsRes.error) throw actionsRes.error;

    // Fetch memory source_ids and metadata for deep links
    const actionsData = actionsRes.data ?? [];
    const memoryIds = actionsData
      .map(a => a.memory_id)
      .filter((id): id is string => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

    interface MemoryMetadata {
      thread_id?: string;
      channel_id?: string;
      channel?: string;
      ts?: string;
      [key: string]: unknown;
    }

    const memoriesMap: Record<string, { source_id: string | null; metadata: MemoryMetadata; timestamp?: string }> = {};
    if (memoryIds.length > 0) {
      const { data: memories } = await supabase
        .from('memories')
        .select('id, source_id, metadata, timestamp')
        .in('id', memoryIds);

      (memories ?? []).forEach(m => {
        memoriesMap[m.id] = {
          source_id: m.source_id || null,
          metadata: (m.metadata as MemoryMetadata) || {},
          timestamp: m.timestamp || undefined,
        };
      });
    }

    const actionsWithSource = actionsData.map(a => {
      const mem = a.memory_id ? memoriesMap[a.memory_id] : null;
      const sourceId = mem ? mem.source_id : null;
      const metadata = mem ? mem.metadata : null;
      
      // Calculate direct platform deep link
      let platformLink: string | null = null;
      const platform = a.platform.toLowerCase();
      
      if (platform === 'gmail') {
        const threadId = metadata?.thread_id || sourceId;
        if (threadId) {
          platformLink = `https://mail.google.com/mail/u/0/#all/${threadId}`;
        } else {
          platformLink = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(a.title)}`;
        }
      } else if (platform === 'slack') {
        const channelId = metadata?.channel_id || metadata?.channel;
        const ts = metadata?.ts;
        if (channelId) {
          if (ts) {
            platformLink = `https://slack.com/app_redirect?channel=${channelId}&message_ts=${ts}`;
          } else {
            platformLink = `https://slack.com/app_redirect?channel=${channelId}`;
          }
        } else if (sourceId && !sourceId.startsWith('test_')) {
          platformLink = `https://slack.com/app_redirect?channel=${sourceId}`;
        } else {
          platformLink = 'https://slack.com';
        }
      } else if (platform === 'github') {
        platformLink = sourceId ? `https://github.com/${sourceId}` : 'https://github.com';
      } else if (platform === 'linear') {
        platformLink = sourceId ? `https://linear.app/issue/${sourceId}` : 'https://linear.app';
      }

      return {
        ...a,
        source_id: sourceId,
        platform_link: platformLink
      };
    });

    // ── STALENESS & AGING CHECKS (Per Action Type) ──────────────────────────
    const now = Date.now();
    const staleActionIds: string[] = [];
    const activeActions: typeof actionsWithSource = [];

    for (const action of actionsWithSource) {
      const mem = action.memory_id ? memoriesMap[action.memory_id] : null;
      let isStale = false;
      let isAging = false;

      const extractedTime = action.extracted_at ? new Date(action.extracted_at).getTime() : now;
      const ageDays = Math.floor((now - extractedTime) / (1000 * 60 * 60 * 24));

      if (action.action_type === 'CALENDAR') {
        // If event date/time has already passed, auto-dismiss
        const eventDateStr = (action.startTime || mem?.metadata?.start_time || mem?.metadata?.date || mem?.timestamp) as string | undefined;
        if (eventDateStr) {
          const eventTime = new Date(eventDateStr).getTime();
          if (!isNaN(eventTime) && eventTime < now) {
            isStale = true;
          }
        }
      } else if (action.action_type === 'EMAIL_REPLY') {
        // If the email reply recommendation has aged > 3 days without action, thread context is moot
        if (ageDays >= 3) {
          isStale = true;
        }
      } else if (action.action_type === 'SLACK_REPLY') {
        // If Slack reply recommendation is > 2 days old, mark stale
        if (ageDays >= 2) {
          isStale = true;
        }
      } else if (action.action_type === 'LINEAR_TICKET' || action.action_type === 'REMINDER') {
        // Keep open, but surface as aging if older than 7 days
        if (ageDays >= 7) {
          isAging = true;
        }
      }

      if (isStale) {
        staleActionIds.push(action.id);
      } else {
        activeActions.push({
          ...action,
          is_aging: isAging,
          age_days: ageDays,
        });
      }
    }

    // Asynchronously auto-dismiss stale actions
    if (staleActionIds.length > 0) {
      supabase
        .from('action_queue')
        .update({ status: 'dismissed' })
        .in('id', staleActionIds)
        .then(({ error }) => {
          if (error) console.warn('[ActionQueue] Auto-dismiss stale error:', error);
          else console.log(`[ActionQueue] Auto-dismissed ${staleActionIds.length} stale actions.`);
        });
    }

    const lastRunAt = logRes.data?.last_run_at ? new Date(logRes.data.last_run_at) : null;
    const isExtractionStale = !lastRunAt || (Date.now() - lastRunAt.getTime()) > 30 * 60 * 1000;

    // Build platform counts map
    const platformCounts: Record<string, number> = {};
    (platformRes.data ?? []).forEach(r => {
      platformCounts[r.platform] = (platformCounts[r.platform] ?? 0) + 1;
    });

    return NextResponse.json({
      actions: activeActions,
      meta: {
        count: activeActions.length,
        isStale: isExtractionStale,
        lastRunAt: lastRunAt?.toISOString() ?? null,
        scanStats: platformCounts,
        totalMemoryCount: logRes.data?.memory_count ?? 0,
      },
      recentlyHandled: recentRes.data ?? [],
    });
  } catch (err) {
    console.error('[ActionQueue GET] Error:', err);
    return NextResponse.json({ error: 'Failed to load action queue' }, { status: 500 });
  }
}

import { ActionQueuePatchSchema, validateBody } from '@/lib/validations';

/**
 * PATCH /api/actions/queue
 * Updates action status (dismiss / approve / executed / failed)
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody = await request.json();
    const validation = validateBody(ActionQueuePatchSchema, rawBody);
    
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    
    const { id, status } = validation.data;
    
    // We still extract 'updates' if there are other allowed fields dynamically sent (like 'notes' or 'result')
    const updates = rawBody as Record<string, unknown>;

    const ALLOWED_PATCH_FIELDS = new Set(['notes', 'result']);
    const safeUpdates = Object.fromEntries(Object.entries(updates).filter(([k]) => ALLOWED_PATCH_FIELDS.has(k)));
    const patch: Record<string, unknown> = { status, ...safeUpdates };
    if (status === 'executed' || status === 'approved') patch.executed_at = new Date().toISOString();

    const { error } = await supabase
      .from('action_queue')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[ActionQueue PATCH] Error:', err);
    return NextResponse.json({ error: 'Failed to update action' }, { status: 500 });
  }
}
