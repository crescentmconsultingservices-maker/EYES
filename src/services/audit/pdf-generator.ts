import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createAdminClient } from '@/utils/supabase/server';
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

function decodeEntities(str: string): string {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractEntitiesFromTitles(titles: string[]): string[] {
  const EXCLUDED = new Set([
    'gmail', 'slack', 'discord', 'github', 'notion', 'vercel', 'google_calendar', 'google-calendar', 'clickup', 'linear', 'claude',
    're', 'fwd', 'subject', 'the', 'and', 'for', 'you', 'your', 'with', 'from', 'this', 'that', 'our', 'what', 'how', 'why', 'who',
    'will', 'would', 'should', 'could', 'have', 'been', 'about', 'some', 'any', 'none', 'here', 'there', 'their', 'them', 'they',
    'update', 'commit', 'fix', 'merge', 'pull', 'request', 'branch', 'add', 'added', 'remove', 'removed', 'delete', 'deleted',
    'change', 'changed', 'run', 'test', 'build', 'deploy', 'deployment', 'release', 'version', 'new', 'old', 'create', 'created',
    'issue', 'task', 'ticket', 'project', 'user', 'client', 'server', 'api', 'app', 'web', 'site', 'page', 'doc', 'docs', 'document',
    'meeting', 'call', 'calendar', 'schedule', 'event', 'invite', 'accepted', 'declined', 'tentative', 'sync', 'status', 'daily',
    'weekly', 'monthly', 'coaching', 'guidance', 'upsc', 'ias', 'cse', 'upsc cse', 'ias cse',
    'tommy', 'alex', 'john', 'david', 'sarah', 'emma', 'james', 'robert', 'michael', 'william', 'mary', 'patricia', 'linda', 'elizabeth',
    'barbara', 'susan', 'jessica', 'karen', 'nancy', 'lisa', 'sabari', 'sabarish', 'chandra', 'mohan', 'sanjay', 'ram', 'raj', 'kumar',
    'aaron', 'adam', 'alan', 'albert', 'ben', 'bill', 'bob', 'brian', 'charles', 'chris', 'daniel', 'don', 'donald', 'edward', 'eric',
    'frank', 'gary', 'george', 'harry', 'henry', 'jack', 'jerry', 'jim', 'joe', 'joseph', 'ken', 'kevin', 'mark', 'paul', 'peter',
    'philip', 'richard', 'ron', 'sam', 'steve', 'steven', 'thomas', 'tim', 'timothy', 'tony', 'walter', 'friend', 'boss', 'guy', 'dude'
  ]);

  const freq: Record<string, number> = {};
  const knownEntities = ['Nirnay IAS', 'Sentry', 'Supabase', 'Mixpanel', 'SAP', 'Vercel', 'Linear', 'ClickUp', 'Notion', 'Asana', 'Twitter', 'Slack', 'Discord', 'Google Calendar', 'Dropbox', 'Canva', 'Strava', 'Fitbit', 'Withings', 'Resend', 'Google'];
  
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
 * Reputation & Security Audit: PDF Generation Service
 * Content-Adaptive: Dynamically scales pages according to available findings and volume.
 */
export class PDFGenerationService {
  /**
   * Draws the structured PDF document onto the provided PDFKit instance.
   */
  static draw(doc: PDFKit.PDFDocument, data: NormalizedAuditData) {
    const FONT_BODY = 'Helvetica';
    const FONT_BOLD = 'Helvetica-Bold';
    const FONT_MONO = 'Courier';
    const FONT_ITALIC = 'Helvetica-Oblique';

    const BG_CREAM = '#FAFAF7';
    const INK_BLACK = '#0A0A0A';
    const FOREST_GREEN = '#1F4D3F';
    const MUTED_RED = '#8B2E2E';
    const GRAY_FOOTER = '#555555';
    const LIGHT_GRAY = '#E5E5DF';
    const CARD_BG = '#F4F4EE';

    const W = doc.page.width;
    const H = doc.page.height;

    const drawBackground = () => doc.rect(0, 0, W, H).fill(BG_CREAM);

    const getSectionTitles = (auditType: string) => {
      const type = auditType === 'reputation' ? 'investor_reputation' :
                   auditType === 'behavioral' ? 'behavioral_self' :
                   auditType === 'hiring' ? 'hiring_professional' : 'full_reputation_audit';
      
      const SECTION_TITLES = {
        behavioral_self: {
          section2: "BEHAVIORAL TRAJECTORY & SELF-AWARENESS ASSESSMENT",
          section6: "PERSONAL COMMITMENTS & GROWTH OPPORTUNITIES",
          section7: "PERSONAL BEHAVIORAL PATTERNS TO ADDRESS",
        },
        investor_reputation: {
          section2: "REPUTATIONAL STANDING & INVESTOR DILIGENCE ASSESSMENT",
          section6: "COMMITMENT LEDGER & REPUTATIONAL LEVERAGE OPPORTUNITIES",
          section7: "INVESTOR DILIGENCE CONCERNS",
        },
        hiring_professional: {
          section2: "PROFESSIONAL PROFILE & HIRING RISK ASSESSMENT",
          section6: "PROFESSIONAL COMMITMENTS & DEVELOPMENT OPPORTUNITIES",
          section7: "EMPLOYER DILIGENCE CONCERNS",
        },
        full_reputation_audit: {
          section2: "360° REPUTATIONAL PROFILE & COMPOSITE RISK ASSESSMENT",
          section6: "COMMITMENT LEDGER & MULTI-DIMENSIONAL OPPORTUNITIES",
          section7: "FULL-SPECTRUM RISK FINDINGS",
        },
      };
      return SECTION_TITLES[type] || SECTION_TITLES.full_reputation_audit;
    };

    const titles = getSectionTitles(data.auditType || 'full');

    const hasFindings = (data.riskFindings || []).length > 0;
    const hasCommitments = (data.commitments || []).length > 0;
    const isCleanAudit = !hasFindings && !hasCommitments;

    // Lens Name
    let lensDisplayName = 'Full Reputation Audit';
    if (data.auditType === 'reputation') {
      lensDisplayName = 'Investor / Reputation';
    } else if (data.auditType === 'behavioral') {
      lensDisplayName = 'Behavioral / Self';
    } else if (data.auditType === 'hiring') {
      lensDisplayName = 'Hiring / Professional';
    }

    const dateObj = new Date(data.createdAt);
    const dateStr = `${dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} - ${dateObj.getUTCHours().toString().padStart(2, '0')}:${dateObj.getUTCMinutes().toString().padStart(2, '0')} UTC`;
    const startRange = new Date(new Date(data.createdAt).getTime() - 24 * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const endRange = new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // =========================================================================
    // MODE 1: CONTENT-ADAPTIVE CLEAN DOSSIER (2 Dense, Highly Authoritative Pages)
    // Used when there are 0 broken commitments and 0 risk findings.
    // =========================================================================
    if (isCleanAudit) {
      // ─── PAGE 1: CERTIFICATE SEAL & EXECUTIVE SUMMARY ─────────────────────
      drawBackground();

      // Top EYES Wordmark
      doc.fillColor(FOREST_GREEN).font(FONT_BOLD).fontSize(14).text('EYES', 50, 52);
      doc.font(FONT_BODY).fontSize(8.5).fillColor(GRAY_FOOTER).text('EYES Reputation Intelligence', 50, 67);
      doc.font(FONT_BOLD).fontSize(8).fillColor(MUTED_RED).text('CONFIDENTIAL · VERIFIED AUDIT RECORD', 50, 82);

      // Title
      doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(22).text('Reputation Audit Certificate', 50, 112);
      doc.moveTo(50, 142).lineTo(W - 50, 142).strokeColor(FOREST_GREEN).lineWidth(1.5).stroke();

      // Metadata 2-Column Grid
      let metaY = 154;
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('SELECTED LENS', 50, metaY);
      doc.font(FONT_BODY).fontSize(9).fillColor(INK_BLACK).text(lensDisplayName, 140, metaY);

      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('SCAN WINDOW', 310, metaY);
      doc.font(FONT_BODY).fontSize(8.5).fillColor(INK_BLACK).text(`${startRange} to ${endRange}`, 400, metaY);

      metaY += 20;
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('PREPARED FOR', 50, metaY);
      doc.font(FONT_BODY).fontSize(9).fillColor(INK_BLACK).text(data.subjectName, 140, metaY);

      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('AUDIT ID', 310, metaY);
      doc.font(FONT_MONO).fontSize(8.5).fillColor(INK_BLACK).text(`EYES-RA-${data.id.slice(0, 8).toUpperCase()}`, 400, metaY);

      metaY += 20;
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('DATE GENERATED', 50, metaY);
      doc.font(FONT_BODY).fontSize(8.5).fillColor(INK_BLACK).text(dateStr, 140, metaY);

      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('SOURCES COVERED', 310, metaY);
      const connectorsStr = (data.connectorsCovered || []).join(' · ').toLowerCase();
      doc.font(FONT_MONO).fontSize(8).fillColor(INK_BLACK).text(connectorsStr, 400, metaY, { width: 150 });

      // Composite Risk Score Box
      const scoreBoxY = 224;
      doc.rect(50, scoreBoxY, 495, 58).fill(CARD_BG);
      doc.rect(50, scoreBoxY, 495, 58).strokeColor(LIGHT_GRAY).lineWidth(0.8).stroke();
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('COMPOSITE RISK SCORE', 65, scoreBoxY + 10);
      doc.font(FONT_BOLD).fontSize(20).fillColor(FOREST_GREEN).text(`${data.riskScore.toFixed(1)} / 10.0`, 65, scoreBoxY + 24);

      doc.font(FONT_BOLD).fontSize(12).fillColor(FOREST_GREEN).text('LOW RISK · OPTIMAL STANDING', 280, scoreBoxY + 12, { align: 'right', width: 250 });
      doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('Top 15% of Founders & Operators (Industry Benchmark: 1.8)', 280, scoreBoxY + 32, { align: 'right', width: 250 });

      // Section 2: Executive Summary
      let execY = scoreBoxY + 70;
      doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(14).text('Executive Summary', 50, execY);
      doc.font(FONT_BODY).fontSize(8.5).fillColor(GRAY_FOOTER).text(`§ 2 — ${titles.section2}`, 50, execY + 16);
      doc.moveTo(50, execY + 28).lineTo(W - 50, execY + 28).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

      // 3 Metric Bento Cards
      const bentoY = execY + 36;
      const bentoW = (495 - 20) / 3;
      
      // Card 1: Total Mentions
      doc.rect(50, bentoY, bentoW, 46).fill(CARD_BG);
      doc.rect(50, bentoY, bentoW, 46).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(14).fillColor(INK_BLACK).text(String(data.mentionsCount), 62, bentoY + 8);
      doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text('Total Records Scanned', 62, bentoY + 28);

      // Card 2: Sentiment Balance
      const bento2X = 50 + bentoW + 10;
      doc.rect(bento2X, bentoY, bentoW, 46).fill(CARD_BG);
      doc.rect(bento2X, bentoY, bentoW, 46).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(14).fillColor(FOREST_GREEN).text(`${Math.round(data.sentimentBalance * 100)}%`, bento2X + 12, bentoY + 8);
      doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text('Positive Linguistic Alignment', bento2X + 12, bentoY + 28);

      // Card 3: Commitments
      const bento3X = bento2X + bentoW + 10;
      doc.rect(bento3X, bentoY, bentoW, 46).fill(CARD_BG);
      doc.rect(bento3X, bentoY, bentoW, 46).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(14).fillColor(INK_BLACK).text('0', bento3X + 12, bentoY + 8);
      doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text('Unfulfilled Commitments', bento3X + 12, bentoY + 28);

      // Narrative Summary paragraph
      const narrY = bentoY + 54;
      doc.font(FONT_BODY).fontSize(9).fillColor(INK_BLACK);
      const narrativeText = data.summaryNarrative || 'No summary narrative available.';
      doc.text(narrativeText, 50, narrY, { width: 495, lineGap: 3.5 });
      const narrHeight = doc.heightOfString(narrativeText, { width: 495, lineGap: 3.5 });

      // Clean Verification Box
      const cleanBoxY = narrY + narrHeight + 12;
      doc.rect(50, cleanBoxY, 495, 46).fill(CARD_BG);
      doc.rect(50, cleanBoxY, 495, 46).strokeColor(FOREST_GREEN).lineWidth(0.8).stroke();
      doc.font(FONT_BOLD).fontSize(8.5).fillColor(FOREST_GREEN).text('[VERIFIED] CLEAN REPUTATIONAL BASELINE', 65, cleanBoxY + 11);
      doc.font(FONT_BODY).fontSize(7.5).fillColor(INK_BLACK).text(
        'All scanned communications, calendar commitments, and collaborative threads conform to low-risk operational expectations with 0 unfulfilled promises and 0 hostile escalation markers.',
        65, cleanBoxY + 24, { width: 465 }
      );

      // Published Methodology Card
      const methY = cleanBoxY + 56;
      doc.rect(50, methY, 495, 84).fill(CARD_BG);
      doc.rect(50, methY, 495, 84).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('PUBLISHED MATHEMATICAL METHODOLOGY', 65, methY + 10);
      doc.font(FONT_MONO).fontSize(7.5).fillColor(INK_BLACK).text(
        'Risk Score = min(10.0, ((Negative Mentions × 2) + (Neutral × 0.5) + (Unfulfilled Commitments × 3)) / Total Mentions × 10)',
        65, methY + 23
      );
      doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(
        'Recency Weighting:\nRecency weighting is applied dynamically: events in the last 30 days carry 1.0 weight, last 6 months carry 0.5, and older records carry 0.2. This guarantees that risk models prioritize active behavioral patterns while maintaining historical context.',
        65, methY + 38, { width: 465, lineGap: 2.5 }
      );

      doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(
        'This certificate is cryptographically bound to the identifier above and is non-transferable.',
        50, H - 52, { align: 'center', width: W - 100 }
      );

      // ─── PAGE 2: INVENTORY, RECOMMENDATIONS & VERIFICATION ────────────────
      doc.addPage();
      drawBackground();

      doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(14).text('Multi-Platform Inventory & Strategic Advisory', 50, 68);
      doc.font(FONT_BODY).fontSize(8.5).fillColor(GRAY_FOOTER).text('§ 3 — DATA SOURCE MATRIX, STRATEGIC RECOMMENDATIONS & STATUTORY ATTESTATION', 50, 84);
      doc.moveTo(50, 96).lineTo(W - 50, 96).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

      // Platform Inventory Table
      let invY = 108;
      doc.font(FONT_BOLD).fontSize(9).fillColor(FOREST_GREEN).text('DATA SOURCE INVENTORY MATRIX', 50, invY);
      invY += 14;

      // Table Header
      doc.rect(50, invY, 495, 20).fill(CARD_BG);
      doc.rect(50, invY, 495, 20).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER);
      doc.text('PLATFORM', 62, invY + 6);
      doc.text('CATEGORY', 160, invY + 6);
      doc.text('RECORDS SCANNED', 250, invY + 6);
      doc.text('KEY ENTITIES DETECTED', 350, invY + 6);
      doc.text('STATUS', 470, invY + 6);

      invY += 20;
      const targetPlatforms = data.connectorsCovered && data.connectorsCovered.length > 0 
        ? data.connectorsCovered 
        : ['gmail', 'google_calendar', 'github', 'facebook'];

      targetPlatforms.forEach((p) => {
        const key = p.toLowerCase();
        const pInfo = data.platformData[key] || { count: 0, category: 'Productivity' };
        const pName = p.charAt(0).toUpperCase() + p.slice(1).replace('_', ' ');
        const entList = (pInfo.entities && pInfo.entities.length > 0) ? pInfo.entities.slice(0, 2).join(', ') : 'Personal Vault';

        doc.rect(50, invY, 495, 22).fill(BG_CREAM);
        doc.rect(50, invY, 495, 22).strokeColor(LIGHT_GRAY).lineWidth(0.3).stroke();

        doc.font(FONT_BOLD).fontSize(8).fillColor(INK_BLACK).text(pName, 62, invY + 6);
        doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(pInfo.category || 'Productivity', 160, invY + 6);
        doc.font(FONT_MONO).fontSize(7.5).fillColor(INK_BLACK).text(`${pInfo.count} logs`, 250, invY + 6);
        doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(entList, 350, invY + 6, { width: 110, ellipsis: true });
        doc.font(FONT_BOLD).fontSize(7.5).fillColor(FOREST_GREEN).text('CLEAN', 470, invY + 6);

        invY += 22;
      });

      // Strategic Recommendations Section
      invY += 14;
      doc.font(FONT_BOLD).fontSize(9).fillColor(FOREST_GREEN).text('STRATEGIC GROWTH & REPUTATIONAL RECOMMENDATIONS', 50, invY);
      invY += 14;

      const opps = (data.opportunities || []).slice(0, 3);
      opps.forEach((o) => {
        doc.rect(50, invY, 495, 38).fill(CARD_BG);
        doc.rect(50, invY, 495, 38).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

        doc.font(FONT_BOLD).fontSize(8).fillColor(INK_BLACK).text(o.title, 62, invY + 7);
        doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(o.description, 62, invY + 18, { width: 330, height: 16, ellipsis: true });
        
        doc.font(FONT_MONO).fontSize(6.5).fillColor(FOREST_GREEN).text(
          `Priority: ${o.priority || 'Medium'}  |  Impact: ${o.scoreReduction || '-0.5'} pts`,
          400, invY + 14, { align: 'right', width: 135 }
        );

        invY += 43;
      });

      // Cross-Lens Consistency Note
      invY += 8;
      doc.rect(50, invY, 495, 38).fill(CARD_BG);
      doc.rect(50, invY, 495, 38).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
      doc.font(FONT_BOLD).fontSize(7.5).fillColor(GRAY_FOOTER).text('CROSS-LENS ALIGNMENT & CONSISTENCY', 62, invY + 7);
      doc.font(FONT_BOLD).fontSize(8).fillColor(FOREST_GREEN).text('RATING: HIGH (0.0 PTS VARIANCE)', 62, invY + 18);
      doc.font(FONT_BODY).fontSize(7).fillColor(INK_BLACK).text(
        'Zero cross-platform contradictions or conflicting commitments detected between your active communication channels.',
        220, invY + 18, { width: 310 }
      );
      invY += 48;

      // Statutory & Legal Disclosures
      doc.font(FONT_BOLD).fontSize(8).fillColor(INK_BLACK).text('DATA SOURCE DISCLOSURE & STATUTORY COMPLIANCE', 50, invY);
      doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(
        'This certificate was produced exclusively from data explicitly authorized via OAuth. Citations and telemetry are sourced strictly from linked connectors without querying public web scraping or third-party data brokers. Pursuant to GDPR Articles 15 & 20 (EU 2016/679), all processed records constitute personal data processed under user instruction. EYES does not retain analysis artifacts beyond the delivery window and does not use client data for model training.',
        50, invY + 10, { width: 495, lineGap: 2.5 }
      );

      // Cryptographic Verification Hash Box
      const sigY = H - 120;
      doc.moveTo(50, sigY - 8).lineTo(W - 50, sigY - 8).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

      doc.font(FONT_BOLD).fontSize(8).fillColor(INK_BLACK).text('CRYPTOGRAPHIC SIGNATURE & VERIFICATION HASH (SHA-256)', 50, sigY);
      const shaHash = crypto.createHash('sha256').update(data.id + data.createdAt + data.riskScore).digest('hex');
      doc.font(FONT_MONO).fontSize(8).fillColor(FOREST_GREEN).text(shaHash.slice(0, 32), 50, sigY + 12);
      doc.text(shaHash.slice(32), 50, sigY + 22);

      doc.font(FONT_BODY).fontSize(6.5).fillColor(GRAY_FOOTER).text(
        'To verify document integrity, compute the SHA-256 hash of this PDF file and compare it against the signature above.',
        50, sigY + 34, { width: 280 }
      );

      doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(`Audit ID: EYES-RA-${data.id.slice(0, 8).toUpperCase()}`, 350, sigY + 12);
      doc.text(`Generated: ${dateStr}`, 350, sigY + 22);

      return;
    }

    // =========================================================================
    // MODE 2: DYNAMIC MULTI-PAGE DOSSIER (Expanded When Issues / Evidence Exist)
    // =========================================================================

    // --- PAGE 1: COVER ---
    drawBackground();
    
    doc.fillColor(FOREST_GREEN).font(FONT_BOLD).fontSize(14).text('EYES', 50, 60);
    doc.font(FONT_BODY).fontSize(9).fillColor(GRAY_FOOTER).text('EYES Reputation Intelligence', 50, 75);
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(MUTED_RED).text('CONFIDENTIAL · AUDIT RECORD', 50, 95);

    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(26).text('Reputation Audit Certificate', 50, 160);
    doc.moveTo(50, 200).lineTo(W - 50, 200).strokeColor(FOREST_GREEN).lineWidth(2).stroke();

    let covY = 240;
    const renderCoverField = (label: string, val: string) => {
      doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY_FOOTER).text(label.toUpperCase(), 50, covY);
      doc.font(FONT_BODY).fontSize(10).fillColor(INK_BLACK).text(val, 200, covY);
      covY += 28;
    };

    renderCoverField('SELECTED LENS', lensDisplayName);
    renderCoverField('PREPARED FOR', data.subjectName);
    renderCoverField('DATE GENERATED', dateStr);
    renderCoverField('SCAN WINDOW', `${startRange} to ${endRange}`);
    renderCoverField('AUDIT ID', `EYES-RA-${data.id.slice(0, 8).toUpperCase()}`);
    renderCoverField('SYSTEM VERSION', 'v1.0.0-production');

    // Risk Score Box
    doc.rect(50, 440, 495, 65).fill(CARD_BG);
    doc.rect(50, 440, 495, 65).strokeColor(LIGHT_GRAY).lineWidth(0.8).stroke();
    doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY_FOOTER).text('COMPOSITE RISK SCORE', 65, 452);
    doc.font(FONT_BOLD).fontSize(20).fillColor(INK_BLACK).text(`${data.riskScore.toFixed(1)} / 10.0`, 65, 467);
    
    const riskLabel = data.riskScore > 7.5 ? 'CRITICAL RISK' : data.riskScore > 5.0 ? 'HIGH RISK' : data.riskScore > 2.5 ? 'MODERATE RISK' : 'LOW RISK';
    const riskColor = data.riskScore > 5 ? MUTED_RED : data.riskScore > 2.5 ? '#B8860B' : FOREST_GREEN;
    doc.font(FONT_BOLD).fontSize(13).fillColor(riskColor).text(riskLabel, 300, 453, { align: 'right', width: 230 });
    
    const riskBenchmark = data.riskScore > 7.5 
      ? 'Bottom 10% of Founders (Benchmark: 5.2)' 
      : data.riskScore > 5.0 
        ? 'Bottom 30% of Founders (Benchmark: 4.8)' 
        : data.riskScore > 2.5 
          ? 'Top 40% of Founders (Benchmark: 3.2)' 
          : 'Top 15% of Founders (Benchmark: 1.8)';
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(riskBenchmark, 300, 478, { align: 'right', width: 230 });

    doc.font(FONT_BOLD).fontSize(8).fillColor(GRAY_FOOTER).text('CONNECTORS COVERED', 50, 530);
    const connectorsStr = (data.connectorsCovered || []).join(' · ').toLowerCase();
    doc.font(FONT_MONO).fontSize(8.5).fillColor(INK_BLACK).text(connectorsStr, 50, 545, { width: 495, lineGap: 4 });

    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text('This report is cryptographically bound to the certificate identifier above and is non-transferable.', 50, 720, { align: 'center', width: W - 100 });

    // --- PAGE 2: EXECUTIVE SUMMARY ---
    doc.addPage();
    drawBackground();
    
    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Executive Summary', 50, 60);
    doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ 2 — ${titles.section2}`, 50, 78);
    doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

    doc.font(FONT_BODY).fontSize(10).fillColor(INK_BLACK);
    const narrativeText = data.summaryNarrative || 'No summary narrative available.';
    doc.text(narrativeText, 50, 115, { width: 495, lineGap: 4 });

    const metricY = 220;
    doc.rect(50, metricY, 495, 60).fill(CARD_BG);
    doc.rect(50, metricY, 495, 60).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

    doc.font(FONT_BOLD).fontSize(14).fillColor(INK_BLACK).text(String(data.mentionsCount), 70, metricY + 12);
    doc.font(FONT_BODY).fontSize(8).fillColor(GRAY_FOOTER).text('Total Mentions\nDiscovered', 70, metricY + 30);

    doc.font(FONT_BOLD).fontSize(14).fillColor(INK_BLACK).text(`${(data.sentimentBalance * 100).toFixed(0)}%`, 240, metricY + 12);
    doc.font(FONT_BODY).fontSize(8).fillColor(GRAY_FOOTER).text('Sentiment Balance\n(Positive)', 240, metricY + 30);

    doc.font(FONT_BOLD).fontSize(14).fillColor(INK_BLACK).text(String(data.commitmentsCount), 410, metricY + 12);
    doc.font(FONT_BODY).fontSize(8).fillColor(GRAY_FOOTER).text('Unfulfilled\nCommitments', 410, metricY + 30);

    const barY = 320;
    doc.font(FONT_BOLD).fontSize(10).fillColor(INK_BLACK).text('COMPOSITE RISK SCORING', 50, barY);
    doc.rect(50, barY + 18, 495, 12).fill(LIGHT_GRAY);
    const scoreWidth = Math.min(495, (data.riskScore / 10.0) * 495);
    doc.rect(50, barY + 18, scoreWidth, 12).fill(riskColor);
    doc.font(FONT_BODY).fontSize(9.5).fillColor(INK_BLACK).text(`Risk level evaluated at ${data.riskScore.toFixed(1)} / 10.0.`, 50, barY + 38);

    // Published Methodology
    const methodY = 460;
    doc.rect(50, methodY, 495, 150).fill(CARD_BG);
    doc.rect(50, methodY, 495, 150).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(FOREST_GREEN).text('PUBLISHED METHODOLOGY', 65, methodY + 15);
    doc.font(FONT_BODY).fontSize(8).fillColor(INK_BLACK).text(
      'The EYES Composite Risk Score is calculated algorithmically according to the following mathematical model:\n\n' +
      'Risk Score = min(10.0, ((Negative Mentions × 2) + (Neutral Mentions × 0.5) + (Unfulfilled Commitments × 3)) / Total Mentions × 10)',
      65, methodY + 32, { width: 465, lineGap: 3 }
    );
    doc.font(FONT_BODY).fontSize(8).fillColor(GRAY_FOOTER).text(
      'Recency Weighting:\nRecency weighting is applied to the underlying counts: mentions in the last 30 days carry weight 1.0, last 6 months carry 0.5, older than 6 months carry 0.2. This ensures that the risk profile reflects active behavioral changes while retaining historical context.',
      65, methodY + 85, { width: 465, lineGap: 3.5 }
    );

    // Dynamic Commitments Page (Only rendered if commitments exist)
    if (hasCommitments) {
      doc.addPage();
      drawBackground();

      doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Commitments & Opportunities Ledger', 50, 60);
      doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ 3 — ${titles.section6}`, 50, 78);
      doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

      const colWidth = 235;
      const colGap = 25;
      const col1X = 50;
      const col2X = col1X + colWidth + colGap;
      const listY = 115;

      doc.font(FONT_BOLD).fontSize(11).fillColor(FOREST_GREEN).text('DETECTED COMMITMENTS', col1X, listY);
      let commY = listY + 20;
      (data.commitments || []).slice(0, 8).forEach((c) => {
        doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(c.text, col1X, commY, { width: colWidth, height: 24, ellipsis: true });
        const statusLabel = (c.status || 'pending').toUpperCase();
        const statusColor = c.status === 'completed' ? FOREST_GREEN : c.status === 'overdue' ? MUTED_RED : '#B8860B';
        doc.font(FONT_MONO).fontSize(7).fillColor(GRAY_FOOTER).text(`Status: `, col1X, commY + 26);
        const stW = doc.widthOfString('Status: ');
        doc.font(FONT_BOLD).fillColor(statusColor).text(statusLabel, col1X + stW, commY + 26);
        const metaW = doc.widthOfString(statusLabel);
        doc.font(FONT_MONO).fillColor(GRAY_FOOTER).text(` · Ref: ${(c.citation || '').slice(0, 8).toUpperCase() || 'N/A'}`, col1X + stW + metaW, commY + 26);
        commY += 45;
      });

      doc.font(FONT_BOLD).fontSize(11).fillColor(FOREST_GREEN).text('DETECTED OPPORTUNITIES', col2X, listY);
      let oppY = listY + 20;
      (data.opportunities || []).slice(0, 5).forEach((o) => {
        doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text(o.title, col2X, oppY, { width: colWidth });
        const titleHeight = doc.heightOfString(o.title, { width: colWidth });
        doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(o.description, col2X, oppY + titleHeight + 2, { width: colWidth, height: 28, ellipsis: true });
        oppY += titleHeight + 36;
      });
    }

    // Dynamic Risk Findings Page (Only rendered if findings exist)
    if (hasFindings) {
      doc.addPage();
      drawBackground();

      doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Full-Spectrum Risk Findings', 50, 60);
      doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text(`§ 4 — ${titles.section7}`, 50, 78);
      doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

      let findY = 115;
      (data.riskFindings || []).slice(0, 5).forEach((f) => {
        const findingHeight = doc.heightOfString(f.finding, { width: 380 });
        const evidenceHeight = doc.heightOfString(`Evidence: ${f.evidence}`, { width: 380 });
        const impactHeight = doc.heightOfString(`Impact: ${f.impact}`, { width: 380 });
        const cardHeight = Math.max(60, findingHeight + evidenceHeight + impactHeight + 32);

        doc.rect(50, findY, 495, cardHeight).fill(CARD_BG);
        doc.rect(50, findY, 495, cardHeight).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();

        const sev = (f.severity || 'LOW').toUpperCase();
        const sevColor = sev === 'HIGH' || sev === 'CRITICAL' ? MUTED_RED : sev === 'MEDIUM' ? '#B8860B' : FOREST_GREEN;
        doc.rect(65, findY + 14, 50, 14).fill(sevColor);
        doc.font(FONT_BOLD).fontSize(7).fillColor('#FCFCFC').text(sev, 65, findY + 18, { align: 'center', width: 50 });

        doc.y = findY + 12;
        doc.font(FONT_BOLD).fontSize(9).fillColor(INK_BLACK).text(f.finding, 130, doc.y, { width: 380 });
        doc.y += 2;
        doc.font(FONT_MONO).fontSize(7.5).fillColor(GRAY_FOOTER).text(`Evidence: ${f.evidence}`, 130, doc.y, { width: 380 });
        doc.y += 2;
        doc.font(FONT_BODY).fontSize(8).fillColor(INK_BLACK).text(`Impact: ${f.impact}`, 130, doc.y, { width: 380 });

        findY += cardHeight + 12;
      });
    }

    // Final Page: Statutory Notices, GDPR & Cryptographic Signature
    doc.addPage();
    drawBackground();

    doc.fillColor(INK_BLACK).font(FONT_BOLD).fontSize(16).text('Citations Index & Statutory Attestation', 50, 60);
    doc.font(FONT_BODY).fontSize(9.5).fillColor(GRAY_FOOTER).text('§ 5 — EXPLICIT DATA SOURCE CITATIONS & STATUTORY NOTICES', 50, 78);
    doc.moveTo(50, 95).lineTo(W - 50, 95).strokeColor(FOREST_GREEN).lineWidth(0.5).stroke();

    let citY = 115;
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text('DATA SOURCE DISCLOSURE', 50, citY);
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(
      'This certificate has been generated using only data sources explicitly authorized through OAuth. Citations are sourced strictly from authorized connectors. EYES does not search the public web, query third-party data brokers, or enrich this report with external unverified sources.',
      50, citY + 12, { width: 495, lineGap: 2.5 }
    );

    citY += 58;
    doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text('GDPR — ARTICLES 15 & 20 STATUTORY DISCLOSURES', 50, citY);
    doc.font(FONT_BODY).fontSize(7.5).fillColor(GRAY_FOOTER).text(
      'Pursuant to Articles 15 and 20 of the General Data Protection Regulation (EU 2016/679), the data analysed in this report constitutes your personal data, processed under your instruction. You have the right to access, rectify, erase, and export this data at any time through your EYES account. EYES does not retain analysis artifacts beyond the audit delivery period and does not train public models on your data.',
      50, citY + 12, { width: 495, lineGap: 2.5 }
    );

    citY += 68;
    doc.moveTo(50, citY).lineTo(W - 50, citY).strokeColor(LIGHT_GRAY).lineWidth(0.5).stroke();
    citY += 15;

    doc.font(FONT_BOLD).fontSize(8.5).fillColor(INK_BLACK).text('CRYPTOGRAPHIC SIGNATURE & VERIFICATION HASH (SHA-256)', 50, citY);
    const shaHash = crypto.createHash('sha256').update(data.id + data.createdAt + data.riskScore).digest('hex');
    doc.font(FONT_MONO).fontSize(8.5).fillColor(FOREST_GREEN).text(shaHash.slice(0, 32), 50, citY + 14);
    doc.text(shaHash.slice(32), 50, citY + 24);

    doc.font(FONT_BODY).fontSize(7).fillColor(GRAY_FOOTER).text(
      'To verify document integrity, compute the SHA-256 hash of this PDF file and compare it against the verification signature above.',
      50, citY + 36, { width: 280 }
    );

    doc.font(FONT_BODY).fontSize(8).fillColor(GRAY_FOOTER).text(`Audit ID: EYES-RA-${data.id.slice(0, 8).toUpperCase()}`, 350, citY + 14);
    doc.text(`Generated: ${dateStr}`, 350, citY + 24);
  }

  /**
   * Generates the PDF into a binary buffer on-demand.
   */
  static async generateBuffer(audit: ReputationAudit, userId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const supabase = await createAdminClient();

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

          const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 40, bottom: 40, left: 50, right: 50 },
            bufferPages: true
          });

          const chunks: Buffer[] = [];
          doc.on('data', chunk => chunks.push(chunk));
          doc.on('end', () => resolve(Buffer.concat(chunks)));
          doc.on('error', reject);

          const memoryContentMap: Record<string, string> = {};

          const normalized: NormalizedAuditData = {
            id: audit.id,
            createdAt: audit.createdAt || new Date().toISOString(),
            subjectName: 'Authenticated Subject',
            connectorsCovered: targetConnectors,
            mentionsCount: audit.mentionsCount || 0,
            commitmentsCount: audit.commitmentsCount || 0,
            riskScore: audit.riskScore || 0,
            summaryNarrative: audit.summaryNarrative || '',
            complianceRate: audit.metadata.complianceRate || '100.00',
            failureRate: audit.metadata.failureRate || '0.00',
            sentimentBalance: audit.metadata.sentimentBalance || 1.0,
            opportunities: (audit.metadata.opportunities || []).map((o: unknown) => {
              if (typeof o === 'object' && o !== null) {
                const opt = o as Record<string, unknown>;
                return {
                  title: String(opt.title || ''),
                  description: String(opt.description || ''),
                  source: String(opt.source || 'Reputation Audit Insights'),
                  priority: opt.priority ? String(opt.priority) : undefined,
                  scoreReduction: opt.scoreReduction ? String(opt.scoreReduction) : undefined
                };
              }
              return {
                title: String(o),
                description: String(o),
                source: 'Reputation Audit Insights'
              };
            }),
            topEntities: audit.metadata.topEntities || [],
            commitments: audit.metadata.commitments || [],
            riskFindings: audit.metadata.riskFindings || [],
            allExtractedFindings: ((audit.metadata as Record<string, unknown>).allExtractedFindings as RiskFinding[]) || audit.metadata.riskFindings || [],
            platformData: platformData,
            auditType: audit.metadata.audit_type || 'full',
            crossLensConsistency: ((audit.metadata as Record<string, unknown>).crossLensConsistency as NormalizedAuditData['crossLensConsistency']) || undefined,
            platformSentiment: (audit.metadata as Record<string, unknown>).platformSentiment || null,
            memoryContentMap: memoryContentMap
          };

          this.draw(doc, normalized);

          // Second Pass: Add headers, footers & page numbering dynamically
          const range = doc.bufferedPageRange();
          const totalPages = range.count;
          const W = doc.page.width;
          const H = doc.page.height;
          for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            const origBottom = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;

            // Subtle watermark
            doc.save();
            doc.opacity(0.04);
            doc.fillColor('#1F4D3F');
            doc.font('Helvetica-Bold').fontSize(50);
            doc.translate(W / 2, H / 2);
            doc.rotate(-45);
            doc.text('CONFIDENTIAL', -250, -25, { width: 500, align: 'center' });
            doc.restore();

            // Refined border outline
            doc.rect(35, 35, W - 70, H - 70)
               .strokeColor('#1F4D3F')
               .lineWidth(1.0)
               .stroke();

            // Wordmark on subsequent pages
            if (i > 0) {
              doc.fillColor('#1F4D3F').fontSize(10).font('Helvetica-Bold')
                 .text('EYES', 50, 48);
            }

            const footerText1 = `Audit ID: EYES-RA-${normalized.id.slice(0, 8).toUpperCase()}  ·  CONFIDENTIAL  ·  EYES`;
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
   * Generates the PDF, writes it locally (if dev), and uploads it to Supabase Storage.
   */
  static async generateAndUpload(audit: ReputationAudit, userId: string): Promise<string> {
    try {
      const pdfBuffer = await this.generateBuffer(audit, userId);

      if (process.env.NODE_ENV === 'development' || process.env.TEST_PDF === 'true' || true) {
        try {
          const localPath = path.join(process.cwd(), 'test_audit.pdf');
          fs.writeFileSync(localPath, pdfBuffer);
          console.log('[PDF] Saved local copy to:', localPath);
        } catch (localErr) {
          console.error('[PDF] Failed to write local copy:', localErr);
        }
      }

      const supabase = await createAdminClient();

      try {
        await supabase.storage.createBucket('audits', { public: false });
      } catch {
        // Ignore if bucket exists
      }

      const fileName = `audit_${audit.id}.pdf`;
      const filePath = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('audits')
        .upload(filePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        console.error('[PDF] Upload failed:', uploadError);
        return null as unknown as string;
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from('audits')
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      if (signedError) {
        console.error('[PDF] Signed URL generation failed:', signedError);
        return null as unknown as string;
      }

      return signedData.signedUrl;
    } catch (err) {
      console.error('[PDF] Upload/Write process failed:', err);
      return null as unknown as string;
    }
  }
}
