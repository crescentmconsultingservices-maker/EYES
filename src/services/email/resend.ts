import { Resend } from 'resend';
import nodemailer from 'nodemailer';

// Default sender identifier
const FROM = 'EYES <onboarding@resend.dev>';

// Lazy-init: new Resend() throws at module load if API key is missing
function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set.');
  return new Resend(key);
}

// ── Nodemailer / Gmail SMTP Transport ─────────────────────────────────────────

function getGmailTransporter() {
  const user = process.env.GMAIL_USER || process.env.DEVELOPER_EMAIL || 'chandruselvam1012@gmail.com';
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!pass) return null;

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass,
    },
  });
}

/**
 * Universal Email Sender:
 * 1. Tries Gmail SMTP (Nodemailer) first if GMAIL_APP_PASSWORD is set.
 * 2. Falls back to Resend if RESEND_API_KEY is set.
 * 3. Logs a mock delivery in local development if neither is configured.
 */
async function sendEmailMessage(params: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ success: boolean; provider: string; id?: string }> {
  const toList = Array.isArray(params.to) ? params.to : [params.to];
  const gmailTransporter = getGmailTransporter();
  const gmailUser = process.env.GMAIL_USER || process.env.DEVELOPER_EMAIL || 'chandruselvam1012@gmail.com';

  // 1. Primary: Gmail SMTP (via Google Account App Password)
  if (gmailTransporter) {
    try {
      const info = await gmailTransporter.sendMail({
        from: `"EYES Intelligence" <${gmailUser}>`,
        to: toList.join(', '),
        replyTo: params.replyTo,
        subject: params.subject,
        html: params.html,
      });
      console.log(`[Gmail SMTP] Sent to ${toList.join(', ')} (MessageId: ${info.messageId})`);
      return { success: true, provider: 'gmail_smtp', id: info.messageId };
    } catch (smtpErr) {
      console.error('[Gmail SMTP] Delivery failed, checking fallback:', smtpErr);
    }
  }

  // 2. Secondary: Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = getResendClient();
      const res = await resend.emails.send({
        from: FROM,
        to: toList,
        replyTo: params.replyTo,
        subject: params.subject,
        html: params.html,
      });
      console.log(`[Resend] Sent to ${toList.join(', ')}`);
      return { success: true, provider: 'resend', id: res.data?.id };
    } catch (resendErr) {
      console.error('[Resend] Delivery failed:', resendErr);
    }
  }

  // 3. Fallback: Local dev mock log
  console.log(`[Email Mock/Dev] To: ${toList.join(', ')} | Subject: "${params.subject}"`);
  return { success: false, provider: 'mock' };
}

// ── Email templates ──────────────────────────────────────────────────────────

function welcomeHtml(name: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; padding: 40px; background: #111; border: 1px solid #1f2937; border-radius: 12px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  p { color: #9ca3af; line-height: 1.6; margin: 12px 0; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: #fff !important; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937; font-size: 12px; color: #4b5563; }
</style></head>
<body>
  <div class="container">
    <h1>EYES is now watching.</h1>
    <p>Hi ${name},</p>
    <p>Your account is active. EYES is indexing your connected platforms and will begin detecting patterns in your behavior over the next 21 days.</p>
    <p>For now — ask it anything about your history. It already knows more than you think.</p>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/chat" class="cta">Open EYES →</a>
    <div class="footer">
      EYES · the-eyes.app
    </div>
  </div>
</body>
</html>`;
}

function clusterReadyHtml(name: string, clusterCount: number) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; padding: 40px; background: #111; border: 1px solid #1f2937; border-radius: 12px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; border-radius: 20px; font-size: 13px; margin-bottom: 20px; }
  p { color: #9ca3af; line-height: 1.6; margin: 12px 0; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: #fff !important; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937; font-size: 12px; color: #4b5563; }
</style></head>
<body>
  <div class="container">
    <div class="badge">🧠 Behavioral patterns detected</div>
    <h1>EYES found ${clusterCount} recurring states in your data.</h1>
    <p>Hi ${name},</p>
    <p>After analyzing your last 21+ days of activity, EYES has detected ${clusterCount} distinct behavioral modes you cycle through. These are not guesses — they are patterns computed from your actual data.</p>
    <p>Open EYES to review and name each pattern. Once confirmed, every chat answer will reference which mode you're currently in.</p>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/chat" class="cta">Review your patterns →</a>
    <div class="footer">
      EYES · the-eyes.app
    </div>
  </div>
</body>
</html>`;
}

function connectorErrorHtml(name: string, platform: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; padding: 40px; background: #111; border: 1px solid #1f2937; border-radius: 12px; }
  h1 { font-size: 24px; font-weight: 700; color: #ef4444; margin: 0 0 8px; }
  p { color: #9ca3af; line-height: 1.6; margin: 12px 0; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #ef4444; color: #fff !important; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937; font-size: 12px; color: #4b5563; }
</style></head>
<body>
  <div class="container">
    <h1>Connection issue: ${platform}</h1>
    <p>Hi ${name},</p>
    <p>EYES lost access to your <strong>${platform}</strong> account. The token may have expired or been revoked.</p>
    <p>To keep your data in sync and ensure accurate behavioral modeling, please reconnect your account.</p>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard" class="cta">Reconnect ${platform} →</a>
    <div class="footer">
      EYES · the-eyes.app
    </div>
  </div>
</body>
</html>`;
}

function draftApprovalHtml(name: string, sender: string, summary: string, draftReply: string, citations: string, actionId: string) {
  const approvalUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/?view=action-queue&id=${actionId}`;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; padding: 40px; background: #111; border: 1px solid #1f2937; border-radius: 12px; }
  h1 { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 8px; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; border-radius: 20px; font-size: 13px; margin-bottom: 20px; }
  p { color: #9ca3af; line-height: 1.6; margin: 12px 0; }
  .quote-box { background: rgba(255,255,255,0.03); border-left: 3px solid #6366f1; padding: 16px; margin: 16px 0; border-radius: 4px; color: #e5e7eb; font-style: italic; white-space: pre-wrap; }
  .citation-box { background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); padding: 12px; margin: 16px 0; border-radius: 4px; color: #9ca3af; font-size: 13px; }
  .cta { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #6366f1; color: #fff !important; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1f2937; font-size: 12px; color: #4b5563; }
</style></head>
<body>
  <div class="container">
    <div class="badge">✉ Action Draft Ready</div>
    <h1>Draft Reply for: "${summary}"</h1>
    <p>Hi ${name},</p>
    <p>EYES has prepared a draft response to an email from <strong>${sender}</strong>. Review the draft below:</p>
    
    <div class="quote-box">${draftReply}</div>
    
    <h3>Why EYES wrote this:</h3>
    <div class="citation-box">${citations}</div>
    
    <p>Please note: this reply will NOT be sent until you approve it.</p>
    
    <a href="${approvalUrl}" class="cta">Approve & Send Draft →</a>
    <div class="footer">
      EYES · the-eyes.app
    </div>
  </div>
</body>
</html>`;
}

// ── Public send functions ──────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string, name: string) {
  return sendEmailMessage({
    to,
    subject: 'EYES is now watching.',
    html: welcomeHtml(name),
  });
}

export async function sendClusterReadyEmail(to: string, name: string, clusterCount: number) {
  return sendEmailMessage({
    to,
    subject: `EYES detected ${clusterCount} behavioral patterns in your data`,
    html: clusterReadyHtml(name, clusterCount),
  });
}

export async function sendConnectorErrorEmail(to: string, name: string, platform: string) {
  return sendEmailMessage({
    to,
    subject: `Action needed: Your ${platform} connection expired`,
    html: connectorErrorHtml(name, platform),
  });
}

export async function sendDraftApprovalEmail(params: {
  to: string;
  name: string;
  sender: string;
  summary: string;
  draftReply: string;
  citations: string;
  actionId: string;
}) {
  return sendEmailMessage({
    to: params.to,
    subject: `[EYES Draft Approval] Reply to "${params.summary}"`,
    html: draftApprovalHtml(
      params.name,
      params.sender,
      params.summary,
      params.draftReply,
      params.citations,
      params.actionId
    ),
  });
}

export async function sendFeedbackEmail(params: {
  ticketId?: string;
  userName: string;
  userEmail: string;
  type?: string;
  area?: string;
  subject?: string;
  message: string;
  systemContext?: string | Record<string, unknown>;
}) {
  const devEmail = process.env.DEVELOPER_EMAIL || 'chandruselvam1012@gmail.com';
  const typeLabel = params.type === 'bug' ? 'Bug Report' : params.type === 'feature' ? 'Feature Request' : 'User Feedback';
  const displaySubject = params.subject || `Feedback from ${params.userName}`;
  const displayTicket = params.ticketId ? `[Ticket #${params.ticketId.slice(0, 8)}] ` : '';

  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; padding: 32px; background: #18181b; border: 1px solid #27272a; border-radius: 16px; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #27272a; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.3); color: #38bdf8; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .badge-bug { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); color: #f87171; }
  .badge-feature { background: rgba(168,85,247,0.15); border-color: rgba(168,85,247,0.3); color: #c084fc; }
  h2 { font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 8px; }
  .subject-line { font-size: 16px; color: #e4e4e7; font-weight: 600; margin: 12px 0 6px; }
  .msg-box { background: rgba(255,255,255,0.04); border-left: 4px solid #38bdf8; padding: 18px; margin: 16px 0; border-radius: 6px; font-size: 14.5px; line-height: 1.6; color: #f4f4f5; white-space: pre-wrap; }
  .meta { font-size: 13px; color: #a1a1aa; line-height: 1.8; margin-top: 20px; background: rgba(0,0,0,0.25); padding: 14px; border-radius: 8px; }
  .meta strong { color: #ffffff; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 12px; color: #71717a; text-align: center; }
</style></head>
<body>
  <div class="container">
    <div class="header">
      <h2>${typeLabel}</h2>
      <span class="badge ${params.type === 'bug' ? 'badge-bug' : params.type === 'feature' ? 'badge-feature' : ''}">Area: ${params.area || 'general'}</span>
    </div>
    
    <div class="subject-line">${displaySubject}</div>
    <div class="msg-box">${params.message}</div>
    
    <div class="meta">
      ${params.ticketId ? `<div><strong>Ticket ID:</strong> ${params.ticketId}</div>` : ''}
      <div><strong>Submitted By:</strong> ${params.userName} (&lt;${params.userEmail}&gt;)</div>
      <div><strong>Timestamp:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST</div>
      ${params.systemContext ? `<div><strong>Diagnostics:</strong> <code>${typeof params.systemContext === 'object' ? JSON.stringify(params.systemContext) : params.systemContext}</code></div>` : ''}
    </div>

    <div class="footer">
      EYES Support Desk · Direct User Dispatch
    </div>
  </div>
</body>
</html>`;

  return sendEmailMessage({
    to: devEmail,
    replyTo: params.userEmail,
    subject: `${displayTicket}${typeLabel}: ${displaySubject}`,
    html: htmlContent,
  });
}

export async function sendTicketReplyEmail(params: {
  to: string;
  userName: string;
  ticketId: string;
  subject: string;
  status: string;
  adminResponse: string;
}) {
  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; padding: 32px; background: #18181b; border: 1px solid #27272a; border-radius: 16px; }
  h2 { font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 12px; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
  .msg-box { background: rgba(255,255,255,0.04); border-left: 4px solid #4ade80; padding: 18px; margin: 16px 0; border-radius: 6px; font-size: 14.5px; line-height: 1.6; color: #f4f4f5; white-space: pre-wrap; }
  p { font-size: 14px; line-height: 1.6; color: #a1a1aa; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 12px; color: #71717a; text-align: center; }
</style></head>
<body>
  <div class="container">
    <span class="badge">Status: ${params.status.toUpperCase()}</span>
    <h2>Update on Ticket #${params.ticketId.slice(0, 8)}</h2>
    <p>Hi ${params.userName},</p>
    <p>Our engineering team has responded to your submission regarding <strong>"${params.subject}"</strong>:</p>
    
    <div class="msg-box">${params.adminResponse}</div>
    
    <p>You can also check the status and complete history of your tickets anytime in your <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/settings" style="color: #38bdf8; text-decoration: underline;">EYES Account Settings</a>.</p>

    <div class="footer">
      EYES Support Desk · Engineering Team
    </div>
  </div>
</body>
</html>`;

  return sendEmailMessage({
    to: params.to,
    subject: `[EYES Support] Response to your ticket: "${params.subject}"`,
    html: htmlContent,
  });
}

/**
 * Sends an organization workspace invitation email with a direct one-click link.
 */
export async function sendOrganizationInviteEmail(params: {
  to: string;
  orgName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}) {
  const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 40px auto; padding: 36px; background: #18181b; border: 1px solid #27272a; border-radius: 16px; }
  .badge { display: inline-block; padding: 4px 12px; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 18px; }
  h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin: 0 0 10px; }
  p { font-size: 14.5px; line-height: 1.6; color: #a1a1aa; margin: 12px 0; }
  .btn-wrap { margin: 28px 0; }
  .cta-btn { display: inline-block; padding: 12px 28px; background: #6366f1; color: #ffffff !important; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
  .info-box { background: rgba(255,255,255,0.03); border: 1px solid #27272a; padding: 14px; border-radius: 8px; font-size: 13px; color: #71717a; margin-top: 20px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #27272a; font-size: 12px; color: #71717a; text-align: center; }
</style></head>
<body>
  <div class="container">
    <div class="badge">Organization Workspace Invitation</div>
    <h1>Join ${params.orgName} on EYES</h1>
    <p>Hi there,</p>
    <p><strong>${params.inviterName}</strong> has invited you to join the <strong>${params.orgName}</strong> workspace on EYES as a <strong>${params.role.toUpperCase()}</strong>.</p>
    <p>Collaborate with your team, explore shared organizational memory pools, and access unified intelligence.</p>
    
    <div class="btn-wrap">
      <a href="${params.inviteUrl}" class="cta-btn">Accept Workspace Invitation →</a>
    </div>

    <div class="info-box">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="${params.inviteUrl}" style="color: #818cf8; word-break: break-all;">${params.inviteUrl}</a>
    </div>

    <div class="footer">
      EYES Intelligence · Multi-Tenant Organization Space
    </div>
  </div>
</body>
</html>`;

  return sendEmailMessage({
    to: params.to,
    subject: `Invitation: Join ${params.orgName} on EYES`,
    html: htmlContent,
  });
}
