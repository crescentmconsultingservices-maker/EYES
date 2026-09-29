import { inngest } from "./client";
import { createAdminClient } from "@/utils/supabase/admin";



export const staleCommitmentAlerts = inngest.createFunction(
  {
    id: "stale-commitment-alerts",
    name: "Stale Commitment & Slippage Monitor",
    triggers: [
      { cron: "0 8 * * *" },
      { event: "iris/commitments.stale" },
    ],
  },
  async ({ event, step }) => {
    const targetUserId = (event.data as Record<string, any>)?.userId;

    // 1. Fetch active commitments older than 5 days
    const staleCommitments = await step.run("fetch-stale-commitments", async () => {
      const supabase = createAdminClient();
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      let query = supabase
        .from('chronic_edges')
        .select(`
          id,
          user_id,
          valid_from,
          tail:chronic_nodes!tail_node_id(name, label)
        `)
        .eq('relation_label', 'commitment')
        .is('valid_to', null)
        .lt('valid_from', fiveDaysAgo)
        .order('valid_from', { ascending: true })
        .limit(25);

      if (targetUserId) {
        query = query.eq('user_id', targetUserId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[Stale Commitments] Query error:', error.message);
        return [];
      }

      return (data || []).map((edge: { id: string; user_id: string; valid_from: string; tail: any }) => ({
        edgeId: edge.id,
        userId: edge.user_id,
        validFrom: edge.valid_from,
        commitmentName: (edge.tail as { name?: string })?.name || 'Unspecified commitment',
      }));
    });

    // 2. Dispatch alerts and reminder actions
    const dispatchResult = await step.run("dispatch-commitment-alerts", async () => {
      if (!staleCommitments.length) {
        return { processed: 0, alertsDispatched: 0 };
      }

      const supabase = createAdminClient();
      let alertsDispatched = 0;

      for (const item of staleCommitments) {
        const dateStr = item.validFrom ? new Date(item.validFrom).toLocaleDateString() : 'recent days';

        // Check if an alert for this commitment was already created
        const { data: existing } = await supabase
          .from('alerts')
          .select('id')
          .eq('user_id', item.userId)
          .eq('alert_type', 'commitment')
          .ilike('title', `%${item.commitmentName.slice(0, 20)}%`)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from('alerts').insert({
            user_id: item.userId,
            alert_type: 'commitment',
            title: `Slipping: ${item.commitmentName.slice(0, 40)}`,
            body: `Open promise made around ${dateStr} has not been completed. Risk of slippage.`,
            is_dismissed: false,
          });

          // Propose calendar block or reminder in action_queue
          await supabase.from('action_queue').insert({
            user_id: item.userId,
            action_type: 'CALENDAR',
            title: `Resolve Commitment: ${item.commitmentName.slice(0, 30)}`,
            body: `Schedule focused time to close open promise from ${dateStr}.`,
            confidence: 0.85,
            status: 'pending',
          });

          alertsDispatched++;
        }
      }

      return { processed: staleCommitments.length, alertsDispatched };
    });

    return { status: "completed", dispatchResult };
  }
);

export const proactiveAgenticScan = inngest.createFunction(
  {
    id: "proactive-agentic-scan",
    name: "Proactive Agentic Scan",
    triggers: [{ cron: "0 */6 * * *" }] // Every 6 hours
  },
  async ({ event, step }) => {
    // 1. Get recent users to scan (simplified: just grab users who have been active)
    const users = await step.run("get-active-users", async () => {
      const supabase = createAdminClient();
      const { data } = await supabase.from('user_profiles').select('user_id').limit(10);
      return data || [];
    });

    for (const u of users) {
      await step.run(`scan-user-${u.user_id}`, async () => {
        const supabase = createAdminClient();
        
        // Let the AI scan the last 6 hours of edges for anomalies
        const { data: edges } = await supabase
          .from('chronic_edges')
          .select('relation_label, valid_from, weight')
          .eq('user_id', u.user_id)
          .order('valid_from', { ascending: false })
          .limit(20);

        if (!edges || edges.length === 0) return { alert: false };

        const summary = edges.map(e => `${e.relation_label} (wt: ${e.weight})`).join(', ');

        const { invokeModel } = await import('@/services/ai/ai');
        const aiRes = await invokeModel({
          capability: 'chat',
          preference: 'system-2', // Use reasoning model
          messages: [{ role: 'user', content: `Analyze this recent graph activity: ${summary}. Is there an anomaly or slippage? Reply with YES or NO.` }]
        });

        if (typeof aiRes === 'string' && aiRes.includes('YES')) {
          await supabase.from('alerts').insert({
            user_id: u.user_id,
            alert_type: 'anomaly',
            title: 'Agentic Scan: Anomaly Detected',
            body: 'IRIS detected unusual patterns or slippage in your recent data activity.',
            is_dismissed: false
          });
          return { alert: true };
        }
        return { alert: false };
      });
    }

    return { status: "completed", scannedUsers: users.length };
  }
);

export const reputationAuditWorker = inngest.createFunction(
  {
    id: "reputation-audit-worker",
    name: "Reputation Audit Analysis Worker",
    triggers: [{ event: "audit/reputation.run" }],
  },
  async ({ event, step }) => {
    const { auditId, userId } = (event.data || {}) as { auditId: string; userId: string };

    if (!auditId || !userId) {
      throw new Error("Missing auditId or userId in event data");
    }

    const result = await step.run("execute-audit-pipeline", async () => {
      const { AuditAnalysisService } = await import("@/services/audit/analysis-pipeline");
      return await AuditAnalysisService.runAnalysis(auditId, userId);
    });

    return { status: "completed", result };
  }
);

export const actionQueueExtractionSchedule = inngest.createFunction(
  {
    id: "action-queue-extraction-schedule",
    name: "Action Queue Scheduled Fan-Out",
    triggers: [
      { cron: "*/30 * * * *" },
      { event: "actions/queue.extract.all" },
    ],
  },
  async ({ step }) => {
    const userIds = await step.run("fetch-active-action-users", async () => {
      const supabase = createAdminClient();
      const { data: userRows } = await supabase
        .from('memories')
        .select('user_id')
        .in('platform', ['gmail', 'google-calendar', 'github', 'linear', 'trello', 'slack', 'notion', 'discord'])
        .limit(1000);

      return [...new Set((userRows ?? []).map((r: { user_id: string }) => r.user_id))];
    });

    if (userIds.length === 0) {
      return { status: "no_users" };
    }

    await step.sendEvent(
      "fan-out-action-extraction",
      userIds.map((userId) => ({
        name: "actions/queue.extract.user",
        data: { userId },
      }))
    );

    return { status: "fanned_out", userCount: userIds.length };
  }
);

export const actionQueueUserWorker = inngest.createFunction(
  {
    id: "action-queue-user-worker",
    name: "Action Queue Single-User Extraction Worker",
    triggers: [{ event: "actions/queue.extract.user" }],
  },
  async ({ event, step }) => {
    const { userId } = (event.data || {}) as { userId: string };
    if (!userId) {
      throw new Error("Missing userId in actions/queue.extract.user event");
    }

    const result = await step.run("extract-actions-for-user", async () => {
      const supabase = createAdminClient();
      const { extractForUser } = await import("@/app/api/actions/extract/route");
      return await extractForUser(userId, supabase);
    });

    return { status: "completed", userId, result };
  }
);

export const functions = [
  staleCommitmentAlerts,
  proactiveAgenticScan,
  reputationAuditWorker,
  actionQueueExtractionSchedule,
  actionQueueUserWorker,
];

