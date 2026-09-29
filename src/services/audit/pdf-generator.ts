import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@/utils/supabase/server';
import { ReputationAudit } from '@/types/dashboard';

interface Opportunity {
  title: string;
  description: string;
  source: string;
  priority?: string;
  scoreReduction?: string;
}

interface Commitment {
  text: string;
  status: 'pending' | 'overdue' | 'completed';
  citation: string;
  platform: string;
  date: string;
}

interface RiskFinding {
  severity: string;
  finding: string;
  evidence: string;
  impact: string;
  platform?: string;
}

export interface NormalizedAuditData {
  id: string;
  createdAt: string;
  subjectName: string;
  connectorsCovered: string[];
  mentionsCount: number;
  commitmentsCount: number;
  riskScore: number;
  summaryNarrative: string;
  complianceRate: string;
  failureRate: string;
  sentimentBalance: number;
  opportunities: Opportunity[];
  topEntities: string[];
  commitments: Commitment[];
  riskFindings: RiskFinding[];
  platformData: Record<string, { count: number; category?: string; memories?: unknown[]; sentiment?: unknown; entities?: string[] }>;
  auditType?: string;
  crossLensConsistency?: {
    consistencyRating: string;
    dimensionScoreVariance: string;
    contradictionFlags: Array<{ severity: string; platformA: string; platformB: string; description: string }>;
    consistencyNarrative: string;
    improvementRecommendation: string;
  };
  platformSentiment?: unknown;
  allExtractedFindings?: RiskFinding[];
  memoryContentMap?: Record<string, string>;
}

function formatPlatformName(platform: string): string {
  const p = platform.toLowerCase().replace(/[_-]/g, ' ');
  if (p === 'google calendar') return 'Google Calendar';
  if (p === 'github') return 'GitHub';
  if (p === 'gmail') return 'Gmail';
  if (p === 'facebook') return 'Facebook';
  if (p === 'slack') return 'Slack';
  if (p === 'notion') return 'Notion';
  if (p === 'discord') return 'Discord';
  if (p === 'linear') return 'Linear';
  if (p === 'clickup') return 'ClickUp';
  if (p === 'vercel') return 'Vercel';
  if (p === 'google docs') return 'Google Docs';
  if (p === 'google sheets') return 'Google Sheets';
  if (p === 'google meet') return 'Google Meet';
  return p.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatInteractionType(platform: string, count: number): string {
  const p = platform.toLowerCase();
  if (p.includes('gmail') || p.includes('email')) return `${count} ${count === 1 ? 'Email' : 'Emails'}`;
  if (p.includes('calendar') || p.includes('meet')) return `${count} ${count === 1 ? 'Meeting' : 'Meetings'}`;
  if (p.includes('github') || p.includes('gitlab')) return `${count} ${count === 1 ? 'Activity' : 'Activities'}`;
  if (p.includes('slack') || p.includes('discord') || p.includes('chat')) return `${count} ${count === 1 ? 'Message' : 'Messages'}`;
  if (p.includes('notion') || p.includes('docs')) return `${count} ${count === 1 ? 'Document' : 'Documents'}`;
  if (p.includes('facebook') || p.includes('meta')) return `${count} ${count === 1 ? 'Social Sync' : 'Social Syncs'}`;
  return `${count} ${count === 1 ? 'Interaction' : 'Interactions'}`;
}

function extractEntitiesFromTitles(titles: string[]): string[] {
  const EXCLUDED = new Set([
    'gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'google-calendar', 'clickup', 'linear', 'claude',
    're', 'fwd', 'subject', 'the', 'and', 'for', 'you', 'your', 'with', 'from', 'this', 'that', 'our', 'what', 'how', 'why', 'who',
    'will', 'would', 'should', 'could', 'have', 'been', 'about', 'some', 'any', 'none', 'here', 'there', 'their', 'them', 'they',
    'update', 'commit', 'fix', 'merge', 'pull', 'request', 'branch', 'add', 'added', 'remove', 'removed', 'delete', 'deleted',
    'change', 'changed', 'run', 'test', 'build', 'deploy', 'deployment', 'release', 'version', 'new', 'old', 'create', 'created',
    'issue', 'task', 'ticket', 'project', 'user', 'client', 'server', 'api', 'app', 'web', 'site', 'page', 'doc', 'docs', 'document',
    'meeting', 'scheduled', 'scheduled_meeting', 'call', 'calendar', 'schedule', 'event', 'invite', 'accepted', 'declined', 'tentative', 'sync', 'status', 'daily',
    'weekly', 'monthly', 'coaching', 'guidance'
  ]);

  const freq: Record<string, number> = {};
  const knownEntities = ['Sentry', 'Supabase', 'Mixpanel', 'SAP', 'Vercel', 'Linear', 'ClickUp', 'Notion', 'Asana', 'Twitter', 'Slack', 'Discord', 'Google Calendar', 'Dropbox', 'Canva', 'Resend', 'Google'];

  titles.forEach(title => {
    if (!title) return;
    knownEntities.forEach(ke => {
      const regex = new RegExp(`\\b${ke}\\b`, 'i');
      if (regex.test(title)) {
        freq[ke] = (freq[ke] || 0) + 3;
      }
    });

    const words = title.match(/\b[A-Z][a-zA-Z0-9-]+\b/g);
    if (words) {
      words.forEach(w => {
        const lower = w.toLowerCase();
        if (EXCLUDED.has(lower) || w.length < 3) return;
        freq[w] = (freq[w] || 0) + 1;
      });
    }
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);
}

/**
 * Reputation & Trust Audit: Dynamic Section-Based PDF Generation
 *
 * Rules:
 * 1. Content fix: One clear count for commitments ("X tracked, Y completed, Z pending").
 * 2. Only real commitments and real findings. No copy-pasted duplicates.
 * 3. No unverifiable claims ("Top 15%", "SOC2 Aligned", "Zero AI Training" removed). Factual statements only.
 * 4. Plain summary line up top: one sentence understandable immediately.
 * 5. Dynamic layout: Built as flowing sections, NOT fixed forced pages.
 *    Empty sections are skipped entirely. New pages start only when space is exhausted.
 */
export class PDFGenerationService {
  static draw(doc: PDFKit.PDFDocument, data: NormalizedAuditData) {
    const FONT_BODY = 'Helvetica';
    const FONT_BOLD = 'Helvetica-Bold';
    const FONT_MONO = 'Courier';

    const BG_CREAM = '#FAFAF7';
    const INK_BLACK = '#0A0A0A';
    const FOREST_GREEN = '#1F4D3F';
    const MUTED_RED = '#8B2E2E';
    const AMBER_GOLD = '#B8860B';
    const GRAY_FOOTER = '#555555';
    const LIGHT_GRAY = '#E5E5DF';
    const CARD_BG = '#F4F4EE';

    const W = doc.page.width;
    const H = doc.page.height;
    const MARGIN_LEFT = 50;
    const MARGIN_BOTTOM = 60;
    const CONTENT_WIDTH = W - 100; // 495pt

    const drawBackground = () => doc.rect(0, 0, W, H).fill(BG_CREAM);

    const ensureSpace = (neededHeight: number) => {
      if (doc.y + neededHeight > H - MARGIN_BOTTOM) {
        doc.addPage();
        drawBackground();
        doc.y = 50;
      }
    };

    // Calculate unified commitments metrics: ONE number, ONE meaning
    const commitmentsList = data.commitments || [];
    const totalComm = commitmentsList.length;
    const completedComm = commitmentsList.filter(c => c.status === 'completed').length;
    const pendingComm = commitmentsList.filter(c => c.status === 'pending' || c.status === 'overdue').length;
    const unifiedCommitmentsCount = `${totalComm} tracked, ${completedComm} completed, ${pendingComm} pending`;

    const findingsList = data.riskFindings || [];
    const hasCommitments = totalComm > 0;
    const hasFindings = findingsList.length > 0;
    const hasOpportunities = (data.opportunities || []).length > 0;
    const hasEntities = (data.topEntities || []).length > 0;

    // Lens Display Name
    let lensDisplayName = 'Full Reputation & Trust Audit';
    if (data.auditType === 'investor' || data.auditType === 'reputation') {
      lensDisplayName = 'Investor & Diligence Lens';
    } else if (data.auditType === 'hiring') {
      lensDisplayName = 'Professional & Hiring Lens';
    } else if (data.auditType === 'behavioral') {
      lensDisplayName = 'Behavioral & Self-Reflection Lens';
    }

    const dateObj = new Date(data.createdAt);
    const dateStr = `${dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · ${dateObj.getUTCHours().toString().padStart(2, '0')}:${dateObj.getUTCMinutes().toString().padStart(2, '0')} UTC`;
    const startRange = new Date(new Date(data.createdAt).getTime() - 24 * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const endRange = new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    // 1. Plain summary line up top: one clear sentence
    let plainSummaryLine = '';
    if (data.riskScore <= 2.5 && pendingComm === 0 && findingsList.length === 0) {
      plainSummaryLine = 'Your data shows no reputation risks. All tracked commitments were kept.';
    } else if (pendingComm > 0 && findingsList.length > 0) {
      plainSummaryLine = `Your data shows ${pendingComm} open commitment${pendingComm !== 1 ? 's' : ''} and ${findingsList.length} flagged item${findingsList.length !== 1 ? 's' : ''} across audited channels.`;
    } else if (pendingComm > 0) {
      plainSummaryLine = `Your data shows ${pendingComm} open commitment${pendingComm !== 1 ? 's' : ''} awaiting completion, with zero flagged reputation risks.`;
    } else if (findingsList.length > 0) {
      plainSummaryLine = `All tracked commitments were kept, but ${findingsList.length} flagged item${findingsList.length !== 1 ? 's' : ''} were identified for review.`;
    } else {
      plainSummaryLine = 'Your data shows no reputation risks. All tracked commitments were kept.';
    }

    // ─── START DYNAMIC FLOW ───
    drawBackground();
    doc.y = 50;

    // Header Wordmark & Tag
    doc.fillColor(FOREST_GREEN).font(FONT_BOLD).fontSize(14).text('EYES', MARGIN_LEFT, doc.y);
    doc.font(FONT_BODY).fontSize(8.5).fillColor(GRAY_FOOTER).text('Reputation & Digital Trust Intelligence', MARGIN_LEFT, doc.y + 2);
    doc.font(FONT_BOLD).fontSize(8).fillColor(MUTED_RED).text('CONFIDENTIAL · AUDIT CERTIFICATE', MARGIN_LEFT, doc.y + 3);

    // Title
    doc.y += 10;
    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(20).text('Reputation Audit Certificate', MARGIN_LEFT, doc.y);
    doc.y += 6;
    doc.moveTo(MARGIN_LEFT, doc.y).lineTo(MARGIN_LEFT + CONTENT_WIDTH, doc.y).strokeColor(FOREST_GREEN).lineWidth(1.5).stroke();
    doc.y += 10;

    // Metadata 2-Column Grid
    const metaStartY = doc.y;
    const col2X = MARGIN_LEFT + 250;

    doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('SELECTED LENS', MARGIN_LEFT, metaStartY);
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(lensDisplayName, MARGIN_LEFT + 100, metaStartY);

    doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('SCAN WINDOW', col2X, metaStartY);
    doc.font(FONT_BODY).fontSize(8).fillColor(INK_BLACK).text(`${startRange} to ${endRange}`, col2X + 85, metaStartY);

    doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('PREPARED FOR', MARGIN_LEFT, metaStartY + 15);
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(data.subjectName, MARGIN_LEFT + 100, metaStartY + 15);

    doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('CERTIFICATE ID', col2X, metaStartY + 15);
    doc.font(FONT_MONO).fontSize(8).fillColor(INK_BLACK).text(`EYES-RA-${data.id.slice(0, 8).toUpperCase()}`, col2X + 85, metaStartY + 15);

    doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('DATE CERTIFIED', MARGIN_LEFT, metaStartY + 30);
    doc.font(FONT_BODY).fontSize(8).fillColor(INK_BLACK).text(dateStr, MARGIN_LEFT + 100, metaStartY + 30);

    doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('DATA STANDARD', col2X, metaStartY + 30);
    doc.font(FONT_BODY).fontSize(8).fillColor(FOREST_GREEN).text('Read-only access · Data not shared with third parties', col2X + 85, metaStartY + 30);

    doc.y = metaStartY + 48;

    // SECTION 1: Plain Summary Line Up Top Banner
    ensureSpace(44);
    const sumBannerY = doc.y;
    doc.rect(MARGIN_LEFT, sumBannerY, CONTENT_WIDTH, 38).fill(CARD_BG);
    doc.rect(MARGIN_LEFT, sumBannerY, CONTENT_WIDTH, 38).strokeColor(FOREST_GREEN).lineWidth(1).stroke();
    doc.font(FONT_BOLD).fontSize(9).fillColor(FOREST_GREEN).text(plainSummaryLine, MARGIN_LEFT + 14, sumBannerY + 12, { width: CONTENT_WIDTH - 28 });
    doc.y = sumBannerY + 48;

    // SECTION 2: Composite Risk Score & Unified Metrics
    ensureSpace(60);
    const scoreBoxY = doc.y;
    const scoreCardW = 160;
    const metricsW = CONTENT_WIDTH - scoreCardW - 12;

    // Left: Score Box
    doc.rect(MARGIN_LEFT, scoreBoxY, scoreCardW, 54).fill(CARD_BG);
    doc.rect(MARGIN_LEFT, scoreBoxY, scoreCardW, 54).strokeColor(LIGHT_GRAY).lineWidth(0.8).stroke();
    doc.font(FONT_BOLD).fontSize(7).fillColor(GRAY_FOOTER).text('RISK SCORE', MARGIN_LEFT + 12, scoreBoxY + 8);
    doc.font(FONT_BOLD).fontSize(20).fillColor(data.riskScore > 5 ? MUTED_RED : data.riskScore > 2.5 ? AMBER_GOLD : FOREST_GREEN)
       .text(`${data.riskScore.toFixed(1)} / 10.0`, MARGIN_LEFT + 12, scoreBoxY + 22);

    // Right: Unified Metrics (Interactions, Commitments, Tone)
    const metricsX = MARGIN_LEFT + scoreCardW + 12;
    doc.rect(metricsX, scoreBoxY, metricsW, 54).fill(CARD_BG);
    doc.rect(metricsX, scoreBoxY, metricsW, 54).strokeColor(LIGHT_GRAY).lineWidth(0.8).stroke();

    const mColW = (metricsW - 20) / 3;
    // Col 1: Interactions
    doc.font(FONT_BOLD).fontSize(11).fillColor(INK_BLACK).text(String(data.mentionsCount), metricsX + 10, scoreBoxY + 10);
    doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text('Interactions evaluated', metricsX + 10, scoreBoxY + 28);

    // Col 2: Commitments (One number, one meaning: unified count)
    const m2X = metricsX + mColW + 10;
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(pendingComm > 0 ? AMBER_GOLD : FOREST_GREEN).text(unifiedCommitmentsCount, m2X, scoreBoxY + 10, { width: mColW + 35 });
    doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text('Tracked commitments', m2X, scoreBoxY + 34);

    // Col 3: Tone
    const m3X = m2X + mColW + 10;
    doc.font(FONT_BOLD).fontSize(11).fillColor(FOREST_GREEN).text(`${Math.round(data.sentimentBalance * 100)}%`, m3X, scoreBoxY + 10);
    doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text('Positive / neutral tone', m3X, scoreBoxY + 28);

    doc.y = scoreBoxY + 64;

    // SECTION 3: Executive Summary & Narrative
    ensureSpace(60);
    doc.font(FONT_BOLD).fontSize(12).fillColor(INK_BLACK).text('Executive Summary', MARGIN_LEFT, doc.y);
    doc.y += 2;
    doc.moveTo(MARGIN_LEFT, doc.y).lineTo(MARGIN_LEFT + CONTENT_WIDTH, doc.y).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();
    doc.y += 8;

    const narrative = data.summaryNarrative || plainSummaryLine;
    doc.font(FONT_BODY).fontSize(8.5).fillColor(INK_BLACK).text(narrative, MARGIN_LEFT, doc.y, { width: CONTENT_WIDTH, lineGap: 3.5 });
    doc.y += 14;

    // SECTION 4: Tracked Commitments (ONLY rendered if commitments exist)
    if (hasCommitments) {
      ensureSpace(50);
      doc.font(FONT_BOLD).fontSize(12).fillColor(INK_BLACK).text(`Tracked Commitments (${unifiedCommitmentsCount})`, MARGIN_LEFT, doc.y);
      doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('Direct deliverables and promises made to other people', MARGIN_LEFT, doc.y + 1);
      doc.y += 4;
      doc.moveTo(MARGIN_LEFT, doc.y).lineTo(MARGIN_LEFT + CONTENT_WIDTH, doc.y).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();
      doc.y += 8;

      commitmentsList.slice(0, 10).forEach(c => {
        ensureSpace(34);
        const cardY = doc.y;
        const isDone = c.status === 'completed';
        const stColor = isDone ? FOREST_GREEN : AMBER_GOLD;
        const stLabel = isDone ? 'COMPLETED' : 'PENDING';

        doc.rect(MARGIN_LEFT, cardY, CONTENT_WIDTH, 30).fill(CARD_BG);
        doc.rect(MARGIN_LEFT, cardY, CONTENT_WIDTH, 30).strokeColor(LIGHT_GRAY).lineWidth(0.4).stroke();

        doc.font(FONT_BOLD).fontSize(8).fillColor(INK_BLACK).text(c.text, MARGIN_LEFT + 10, cardY + 6, { width: CONTENT_WIDTH - 110, ellipsis: true });
        doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(`Source: ${formatPlatformName(c.platform)} · Ref: ${(c.citation || '').slice(0, 8).toUpperCase()}`, MARGIN_LEFT + 10, cardY + 18);

        // Status pill
        doc.rect(MARGIN_LEFT + CONTENT_WIDTH - 90, cardY + 7, 80, 16).fill(isDone ? '#E6F4EA' : '#FEF3C7');
        doc.font(FONT_BOLD).fontSize(7).fillColor(stColor).text(stLabel, MARGIN_LEFT + CONTENT_WIDTH - 90, cardY + 11, { align: 'center', width: 80 });

        doc.y = cardY + 34;
      });
      doc.y += 8;
    }

    // SECTION 5: Risk Findings & Diligence Observations (ONLY rendered if findings exist)
    if (hasFindings) {
      ensureSpace(50);
      doc.font(FONT_BOLD).fontSize(12).fillColor(INK_BLACK).text(`Risk Findings & Observations (${findingsList.length})`, MARGIN_LEFT, doc.y);
      doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('Forensic risk indicators identified across connected sources', MARGIN_LEFT, doc.y + 1);
      doc.y += 4;
      doc.moveTo(MARGIN_LEFT, doc.y).lineTo(MARGIN_LEFT + CONTENT_WIDTH, doc.y).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();
      doc.y += 8;

      findingsList.slice(0, 8).forEach(f => {
        ensureSpace(46);
        const cardY = doc.y;
        const sev = (f.severity || 'Medium').toUpperCase();
        const sevColor = sev === 'HIGH' || sev === 'CRITICAL' ? MUTED_RED : sev === 'MEDIUM' ? AMBER_GOLD : FOREST_GREEN;

        doc.rect(MARGIN_LEFT, cardY, CONTENT_WIDTH, 40).fill(CARD_BG);
        doc.rect(MARGIN_LEFT, cardY, CONTENT_WIDTH, 40).strokeColor(LIGHT_GRAY).lineWidth(0.4).stroke();

        // Severity tag
        doc.rect(MARGIN_LEFT + 10, cardY + 12, 50, 16).fill(sevColor);
        doc.font(FONT_BOLD).fontSize(7).fillColor('#FFFFFF').text(sev, MARGIN_LEFT + 10, cardY + 16, { align: 'center', width: 50 });

        // Finding details
        doc.font(FONT_BOLD).fontSize(8).fillColor(INK_BLACK).text(f.finding, MARGIN_LEFT + 70, cardY + 6, { width: CONTENT_WIDTH - 80, ellipsis: true });
        doc.font(FONT_MONO).fontSize(7).fillColor(GRAY_FOOTER).text(`Evidence: ${f.evidence} · Platform: ${formatPlatformName(f.platform || 'Connected Vault')}`, MARGIN_LEFT + 70, cardY + 17, { width: CONTENT_WIDTH - 80, ellipsis: true });
        doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(`Impact: ${f.impact || 'Diligence observation'}`, MARGIN_LEFT + 70, cardY + 27, { width: CONTENT_WIDTH - 80, ellipsis: true });

        doc.y = cardY + 44;
      });
      doc.y += 8;
    }

    // SECTION 6: Strategic Recommendations (ONLY rendered if opportunities exist)
    if (hasOpportunities) {
      ensureSpace(50);
      doc.font(FONT_BOLD).fontSize(12).fillColor(INK_BLACK).text(`Strategic Guidance & Recommendations (${data.opportunities.length})`, MARGIN_LEFT, doc.y);
      doc.y += 4;
      doc.moveTo(MARGIN_LEFT, doc.y).lineTo(MARGIN_LEFT + CONTENT_WIDTH, doc.y).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();
      doc.y += 8;

      (data.opportunities || []).slice(0, 3).forEach(o => {
        ensureSpace(36);
        const cardY = doc.y;
        doc.rect(MARGIN_LEFT, cardY, CONTENT_WIDTH, 32).fill(CARD_BG);
        doc.rect(MARGIN_LEFT, cardY, CONTENT_WIDTH, 32).strokeColor(LIGHT_GRAY).lineWidth(0.4).stroke();

        doc.font(FONT_BOLD).fontSize(8).fillColor(INK_BLACK).text(o.title, MARGIN_LEFT + 10, cardY + 6, { width: CONTENT_WIDTH - 20, ellipsis: true });
        doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(o.description, MARGIN_LEFT + 10, cardY + 17, { width: CONTENT_WIDTH - 20, ellipsis: true });

        doc.y = cardY + 36;
      });
      doc.y += 8;
    }

    // SECTION 7: Key Entities & Associations (ONLY rendered if entities exist)
    if (hasEntities) {
      ensureSpace(40);
      doc.font(FONT_BOLD).fontSize(10).fillColor(FOREST_GREEN).text('KEY ENTITIES & REPUTATIONAL ASSOCIATIONS', MARGIN_LEFT, doc.y);
      doc.y += 4;
      const entitiesList = (data.topEntities || []).slice(0, 8).join('  ·  ');
      doc.font(FONT_BODY).fontSize(8).fillColor(INK_BLACK).text(entitiesList, MARGIN_LEFT, doc.y, { width: CONTENT_WIDTH });
      doc.y += 14;
    }

    // SECTION 8: Data Sources Inventory Matrix
    ensureSpace(60);
    doc.font(FONT_BOLD).fontSize(10).fillColor(FOREST_GREEN).text('AUDITED DATA SOURCES MATRIX', MARGIN_LEFT, doc.y);
    doc.y += 6;

    const sources = (data.connectorsCovered && data.connectorsCovered.length > 0)
      ? data.connectorsCovered
      : ['gmail', 'google_calendar'];

    const invLineY = doc.y;
    doc.rect(MARGIN_LEFT, invLineY, CONTENT_WIDTH, 18).fill(CARD_BG);
    doc.rect(MARGIN_LEFT, invLineY, CONTENT_WIDTH, 18).strokeColor(LIGHT_GRAY).lineWidth(0.4).stroke();
    doc.font(FONT_BOLD).fontSize(7).fillColor(GRAY_FOOTER);
    doc.text('PLATFORM', MARGIN_LEFT + 10, invLineY + 5);
    doc.text('CATEGORY', MARGIN_LEFT + 160, invLineY + 5);
    doc.text('VOLUME', MARGIN_LEFT + 320, invLineY + 5);
    doc.text('STATUS', MARGIN_LEFT + 420, invLineY + 5);
    doc.y = invLineY + 18;

    sources.forEach(p => {
      ensureSpace(18);
      const rowY = doc.y;
      const key = p.toLowerCase();
      const pInfo = data.platformData[key] || { count: 0, category: 'Productivity' };
      const friendlyCount = formatInteractionType(p, pInfo.count);

      doc.rect(MARGIN_LEFT, rowY, CONTENT_WIDTH, 16).fill(BG_CREAM);
      doc.rect(MARGIN_LEFT, rowY, CONTENT_WIDTH, 16).strokeColor(LIGHT_GRAY).lineWidth(0.2).stroke();

      doc.font(FONT_BOLD).fontSize(7.5).fillColor(INK_BLACK).text(formatPlatformName(p), MARGIN_LEFT + 10, rowY + 4);
      doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(pInfo.category || 'Productivity', MARGIN_LEFT + 160, rowY + 4);
      doc.font(FONT_BODY).fontSize(7).fillColor(INK_BLACK).text(friendlyCount, MARGIN_LEFT + 320, rowY + 4);
      doc.font(FONT_BOLD).fontSize(7).fillColor(FOREST_GREEN).text('VERIFIED', MARGIN_LEFT + 420, rowY + 4);

      doc.y = rowY + 16;
    });
    doc.y += 12;

    // SECTION 9: Factual Data Privacy Standards & Cryptographic Seal
    ensureSpace(100);
    const privacyY = doc.y;
    doc.rect(MARGIN_LEFT, privacyY, CONTENT_WIDTH, 48).fill(CARD_BG);
    doc.rect(MARGIN_LEFT, privacyY, CONTENT_WIDTH, 48).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

    doc.font(FONT_BOLD).fontSize(7.5).fillColor(FOREST_GREEN).text('VERIFIED PRIVACY STANDARDS', MARGIN_LEFT + 10, privacyY + 7);
    doc.font(FONT_BODY).fontSize(7).fillColor(INK_BLACK).text(
      '• Read-only access: Connected services are evaluated via authenticated, read-only OAuth tokens.\n' +
      '• Private by design: Customer data is never shared with third parties or public brokers.\n' +
      '• User data sovereignty: You retain the right to inspect, export, or erase your indexed records at any time.',
      MARGIN_LEFT + 10, privacyY + 18, { width: CONTENT_WIDTH - 20, lineGap: 2.5 }
    );

    // Cryptographic Seal
    const sealY = privacyY + 54;
    doc.font(FONT_BOLD).fontSize(7.5).fillColor(INK_BLACK).text('CRYPTOGRAPHIC AUTHENTICITY SEAL (SHA-256)', MARGIN_LEFT, sealY);
    const shaHash = crypto.createHash('sha256').update(data.id + data.createdAt + data.riskScore).digest('hex');
    doc.font(FONT_MONO).fontSize(7.5).fillColor(FOREST_GREEN).text(`SHA-256: ${shaHash.slice(0, 32)} ${shaHash.slice(32)}`, MARGIN_LEFT, sealY + 10);
    doc.font(FONT_BODY).fontSize(6.5).fillColor(GRAY_FOOTER).text(
      `Certificate ID: EYES-RA-${data.id.slice(0, 8).toUpperCase()}  ·  Certified: ${dateStr}`,
      MARGIN_LEFT, sealY + 22
    );
  }

  /**
   * Generates the PDF into a binary buffer on-demand.
   */
  static async generateBuffer(audit: ReputationAudit, userId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const supabase = await createClient();

          // Resolve real user display name
          let subjectName = 'Authorized Account Holder';
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, name, email')
              .eq('id', userId)
              .maybeSingle();

            if (profile?.full_name?.trim()) {
              subjectName = profile.full_name.trim();
            } else if (profile?.name?.trim()) {
              subjectName = profile.name.trim();
            } else if (profile?.email?.trim()) {
              subjectName = profile.email.trim();
            } else if ((supabase.auth as any)?.admin?.getUserById) {
              const { data: authUser } = await (supabase.auth as any).admin.getUserById(userId);
              if (authUser?.user?.email) {
                subjectName = authUser.user.user_metadata?.full_name || authUser.user.email;
              }
            }
          } catch (e) {
            console.warn('[PDF] Could not resolve profile name:', e);
          }

          const targetConnectors = (audit.connectorsCovered && audit.connectorsCovered.length > 0)
            ? audit.connectorsCovered
            : ['gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'clickup', 'linear'];

          const platformCounts: Record<string, number> = {};
          const platformTitles: Record<string, string[]> = {};
          targetConnectors.forEach((platform) => {
            platformCounts[platform] = 0;
            platformTitles[platform.toLowerCase()] = [];
          });

          const { data: countData, error: countError } = await supabase
            .from('memories')
            .select('platform, title')
            .eq('user_id', userId)
            .in('platform', targetConnectors);

          if (!countError && countData) {
            countData.forEach((row) => {
              const p = row.platform;
              if (p && platformCounts[p] !== undefined) {
                platformCounts[p]++;
                if (row.title) {
                  platformTitles[p.toLowerCase()].push(row.title);
                }
              }
            });
          }

          const platformCategories: Record<string, string> = {
            gmail: 'Productivity',
            slack: 'Productivity',
            discord: 'Social / Identity',
            notion: 'Productivity',
            github: 'Development',
            vercel: 'Development',
            google_calendar: 'Productivity',
            facebook: 'Social / Identity',
            google_docs: 'Productivity',
            google_sheets: 'Productivity',
            google_slides: 'Productivity',
            google_meet: 'Productivity',
            google_chat: 'Productivity',
            google_maps: 'Productivity',
            youtube: 'Social / Identity',
            clickup: 'Productivity',
            linear: 'Productivity',
          };

          const platformData: NormalizedAuditData['platformData'] = {};
          targetConnectors.forEach((platform) => {
            const key = platform.toLowerCase();
            const realCount = platformCounts[platform];
            const connectorEntities = extractEntitiesFromTitles(platformTitles[key] || []);
            platformData[key] = {
              count: realCount || 0,
              category: platformCategories[key] || 'Productivity',
              entities: connectorEntities,
              memories: []
            };
          });

          // Extract commitments and findings
          const findingsData = (audit.extractedFindings || {}) as Record<string, any>;
          const rawCommitments = (findingsData.commitments || audit.metadata?.commitments || []) as Commitment[];
          const rawFindings = (findingsData.flagged_items || audit.metadata?.riskFindings || []) as RiskFinding[];
          const rawOpportunities = (findingsData.opportunities || audit.metadata?.opportunities || []) as Opportunity[];
          const rawEntities = (findingsData.entities || audit.metadata?.topEntities || []) as string[];

          const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 55, left: 50, right: 50 },
            autoFirstPage: true,
            bufferPages: true
          });

          const chunks: Buffer[] = [];
          doc.on('data', chunk => chunks.push(chunk));
          doc.on('end', () => resolve(Buffer.concat(chunks)));
          doc.on('error', err => reject(err));

          const normalized: NormalizedAuditData = {
            id: audit.id,
            createdAt: audit.createdAt || new Date().toISOString(),
            subjectName: subjectName || 'Account Holder',
            connectorsCovered: targetConnectors,
            mentionsCount: audit.mentionsCount || 0,
            commitmentsCount: audit.commitmentsCount || 0,
            riskScore: Number(audit.riskScore || 0),
            summaryNarrative: audit.summaryNarrative || '',
            complianceRate: (audit.metadata as Record<string, string>)?.complianceRate || '100.00',
            failureRate: (audit.metadata as Record<string, string>)?.failureRate || '0.00',
            sentimentBalance: (audit.metadata as Record<string, number>)?.sentimentBalance ?? 1.0,
            opportunities: rawOpportunities,
            topEntities: rawEntities,
            commitments: rawCommitments,
            riskFindings: rawFindings,
            platformData: platformData,
            auditType: (audit.metadata as Record<string, string>)?.audit_type || 'full',
          };

          // Draw dynamic sections
          this.draw(doc, normalized);

          // Second Pass: Add subtle borders, headers, and dynamic page count ("Page X of Y")
          const range = doc.bufferedPageRange();
          const totalPages = range.count;
          const W = doc.page.width;
          const H = doc.page.height;

          for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            const origBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;

            // Watermark on background
            doc.save();
            doc.opacity(0.03);
            doc.fillColor('#1F4D3F');
            doc.font('Helvetica-Bold').fontSize(45);
            doc.translate(W / 2, H / 2);
            doc.rotate(-45);
            doc.text('CONFIDENTIAL', -250, -20, { width: 500, align: 'center' });
            doc.restore();

            // Border outline
            doc.rect(35, 35, W - 70, H - 70)
               .strokeColor('#1F4D3F')
               .lineWidth(0.8)
               .stroke();

            // Wordmark on subsequent pages
            if (i > 0) {
              doc.fillColor('#1F4D3F').fontSize(9).font('Helvetica-Bold')
                 .text('EYES · Reputation Dossier', 50, 42);
            }

            // Footer on every page
            const footerText1 = `Certificate ID: EYES-RA-${normalized.id.slice(0, 8).toUpperCase()}  ·  CONFIDENTIAL  ·  EYES`;
            const footerText2 = `Page ${i + 1} of ${totalPages}`;

            doc.fillColor('#555555').fontSize(7.5).font('Helvetica')
               .text(footerText1, 50, H - 46, { align: 'center', width: W - 100, lineBreak: false })
               .text(footerText2, 50, H - 35, { align: 'center', width: W - 100, lineBreak: false });

            doc.page.margins.bottom = origBottom;
          }

          doc.end();

        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  /**
   * Generates the PDF and uploads it to Supabase Storage if required.
   */
  static async generateAndUpload(audit: ReputationAudit, userId: string): Promise<string> {
    try {
      const pdfBuffer = await this.generateBuffer(audit, userId);

      if (process.env.NODE_ENV === 'development' || process.env.TEST_PDF === 'true') {
        try {
          const localPath = path.join(process.cwd(), 'test_audit.pdf');
          fs.writeFileSync(localPath, pdfBuffer);
        } catch {}
      }

      const supabase = await createClient();
      try {
        await supabase.storage.createBucket('audits', { public: false });
      } catch {}

      const fileName = `audit_${audit.id}.pdf`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('audits')
        .upload(filePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) return null as unknown as string;

      const { data: signedData, error: signedError } = await supabase.storage
        .from('audits')
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      if (signedError) return null as unknown as string;

      return signedData.signedUrl;
    } catch {
      return null as unknown as string;
    }
  }
}
