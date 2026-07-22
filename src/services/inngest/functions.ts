import { inngest } from "./client";

export const investigateChurn = inngest.createFunction(
  { id: "investigate-churn", name: "Investigate Churn and Draft Emails", triggers: [{ event: "iris/investigate.churn" }] },
  async ({ event, step }) => {
    // 1. Initial investigation
    const investigationData = await step.run("gather-churn-data", async () => {
      // Mock data gathering
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { 
        churnRate: "4.2%", 
        keyReason: "Lack of mobile app features",
        affectedUsers: 154
      };
    });

    // 2. Draft the email based on data
    const draft = await step.run("draft-response", async () => {
      // Mock LLM generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      return `Drafted email for 154 users. Addressing mobile app concerns.`;
    });

    // 3. Wait for human approval from the phone/UI
    const approval = await step.waitForEvent("wait-for-approval", {
      event: "iris/investigate.approval",
      timeout: "24h",
      match: "data.taskId", // Ensure we match the approval to this specific task
    });

    if (approval && approval.data.approved) {
      await step.run("send-emails", async () => {
        // Send the emails
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { success: true, count: 154 };
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
