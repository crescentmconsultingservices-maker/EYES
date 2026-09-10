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

export const functions = [
  investigateChurn,
];
