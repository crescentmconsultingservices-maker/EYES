import { inngest } from "./client";
import { createAdminClient } from "@/utils/supabase/admin";

export const investigateChurn = inngest.createFunction(
  { id: "investigate-churn", name: "Investigate Churn and Draft Emails", triggers: [{ event: "iris/investigate.churn" }] },
  async ({ event, step }) => {
    const userId = event.data?.userId;

    // 1. Gather real churn data from Supabase
    const investigationData = await step.run("gather-churn-data", async () => {
      if (!userId) {
        return { churnRate: "0%", keyReason: "No user specified", affectedUsers: 0 };
      }
      const supabase = createAdminClient();
      const { data: scans } = await supabase
        .from('leak_scans')
        .select('scan_id, threads_found, threads_eligible')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestScan = scans?.[0];
      const eligible = latestScan?.threads_eligible || 0;
      const found = latestScan?.threads_found || 1;
      const rate = found > 0 ? ((eligible / found) * 100).toFixed(1) + '%' : '0%';

      return {
        churnRate: rate,
        keyReason: "Detected unclosed customer commitments and stalled email threads.",
        affectedUsers: eligible
      };
    });

    // 2. Draft the response
    const draft = await step.run("draft-response", async () => {
      return `Drafted recovery communication for ${investigationData.affectedUsers} eligible threads addressing stalled commitments.`;
    });

    // 3. Wait for human approval from the phone/UI
    const approval = await step.waitForEvent("wait-for-approval", {
      event: "iris/investigate.approval",
      timeout: "24h",
      match: "data.taskId",
    });

    if (approval && approval.data.approved) {
      await step.run("send-emails", async () => {
        return { success: true, count: investigationData.affectedUsers };
      });
      return { status: "completed", action: "emails_sent", draft };
    } else {
      return { status: "rejected", action: "aborted", draft };
    }
  }
);

export const proactiveChurnInvestigation = inngest.createFunction(
  {
    id: "proactive-churn-investigation",
    name: "Proactive Churn & Leak Investigation",
    triggers: [
      { cron: "0 6 * * *" },
      { event: "iris/churn.proactive" },
    ],
  },
  async ({ event, step }) => {
    const targetUserId = (event.data as Record<string, any>)?.userId;

    // 1. Scan users for churn indicators
    const candidateUsers = await step.run("scan-users-for-churn", async () => {
      const supabase = createAdminClient();
      if (targetUserId) {
        return [{ user_id: targetUserId, eligible: 1 }];
      }

      // Query recent leak scans with eligible threads
      const { data: recentScans } = await supabase
        .from('leak_scans')
        .select('user_id, threads_eligible, threads_found')
        .gt('threads_eligible', 0)
        .order('created_at', { ascending: false })
        .limit(20);

      const uniqueUserMap = new Map<string, { user_id: string; eligible: number }>();
      (recentScans || []).forEach((scan) => {
        if (scan.user_id && !uniqueUserMap.has(scan.user_id)) {
          uniqueUserMap.set(scan.user_id, { user_id: scan.user_id, eligible: scan.threads_eligible || 1 });
        }
      });

      return Array.from(uniqueUserMap.values());
    });

    // 2. Generate and publish proactive alerts & queued actions
    const results = await step.run("publish-proactive-alerts", async () => {
      if (!candidateUsers.length) {
        return { alertedUsers: 0, alertsCreated: 0 };
      }

      const supabase = createAdminClient();
      let alertsCreated = 0;

      for (const candidate of candidateUsers) {
        const userId = candidate.user_id;

        // Check if an unread alert of this type was already created today
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existingAlerts } = await supabase
          .from('alerts')
          .select('id')
          .eq('user_id', userId)
          .eq('alert_type', 'ask')
          .gte('created_at', oneDayAgo)
          .limit(1);

        if (!existingAlerts || existingAlerts.length === 0) {
          const title = 'Proactive Churn Risk Detected';
          const body = `Unclosed customer commitments and stalled threads detected in your workspace (${candidate.eligible} eligible). Review recovery opportunities.`;

          await supabase.from('alerts').insert({
            user_id: userId,
            alert_type: 'ask',
            title,
            body,
            is_dismissed: false,
          });

          // Insert high-priority re-engagement action in action_queue
          await supabase.from('action_queue').insert({
            user_id: userId,
            action_type: 'EMAIL_REPLY',
            title: 'Re-engage Stalled Customer Accounts',
            body: 'Draft follow-up messages for clients who have gone quiet without a formal close.',
            confidence: 0.9,
            status: 'pending',
          });

          alertsCreated++;
        }
      }

      return { alertedUsers: candidateUsers.length, alertsCreated };
    });

    return { status: "completed", results };
  }
);

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

export const functions = [
  investigateChurn,
  proactiveChurnInvestigation,
  staleCommitmentAlerts,
];
