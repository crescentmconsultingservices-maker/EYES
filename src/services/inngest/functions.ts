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

export const functions = [

  staleCommitmentAlerts,
  proactiveAgenticScan
];
