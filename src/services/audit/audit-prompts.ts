export const SECTION_TITLES: Record<string, { section2: string; section6: string; section7: string }> = {
  behavioral: {
    section2: "BEHAVIORAL TRAJECTORY & SELF-AWARENESS ASSESSMENT",
    section6: "PERSONAL COMMITMENTS & GROWTH OPPORTUNITIES",
    section7: "PERSONAL BEHAVIORAL PATTERNS TO ADDRESS",
  },
  reputation: {
    section2: "REPUTATIONAL STANDING & INVESTOR DILIGENCE ASSESSMENT",
    section6: "COMMITMENT LEDGER & REPUTATIONAL LEVERAGE OPPORTUNITIES",
    section7: "INVESTOR DILIGENCE CONCERNS",
  },
  hiring: {
    section2: "PROFESSIONAL PROFILE & HIRING RISK ASSESSMENT",
    section6: "PROFESSIONAL COMMITMENTS & DEVELOPMENT OPPORTUNITIES",
    section7: "EMPLOYER DILIGENCE CONCERNS",
  },
  full: {
    section2: "360° REPUTATIONAL PROFILE & COMPOSITE RISK ASSESSMENT",
    section6: "COMMITMENT LEDGER & MULTI-DIMENSIONAL OPPORTUNITIES",
    section7: "FULL-SPECTRUM RISK FINDINGS",
  },
};

export const EXECUTIVE_SUMMARY_INSTRUCTIONS: Record<string, string> = {
  behavioral: `
EXECUTIVE SUMMARY INSTRUCTIONS:
- Use second-person "you" language throughout
- Lead with: "Your digital behavior over the past [X] months..."
- Focus on: personal growth trajectory, self-consistency, 
  stress signals, communication tone trends
- Highlight: quarter-over-quarter improvement or decline
- Close with: a constructive self-reflection statement
- Tone: personal coach, honest but compassionate
- Example opening: "Your digital footprint across [N] platforms 
  over the past 24 months reflects a subject with strong 
  professional output discipline, though recurring late-night 
  delivery patterns suggest scope underestimation as a 
  persistent personal challenge."
`,
  reputation: `
EXECUTIVE SUMMARY INSTRUCTIONS:
- Use third-person "the subject" language throughout
- Lead with: "The subject's digital record across [N] platforms..."
- Focus on: commitment follow-through rate, timeline consistency,
  credibility signals, contradiction count
- Highlight: any unfulfilled commitments or cross-platform 
  contradictions that would concern an investor
- Close with: an overall investability assessment statement
- Tone: formal, due-diligence grade, neutral
- Example opening: "The subject's digital record across [N] 
  platforms over a 24-month window indicates a broadly 
  consistent professional profile, with [X] commitment 
  instances identified and a [Y]% follow-through rate — 
  a profile that presents [low/moderate/elevated] diligence 
  exposure for prospective investors."
`,
  hiring: `
EXECUTIVE SUMMARY INSTRUCTIONS:
- Use "the candidate" language throughout
- Lead with: "The candidate's professional digital record..."
- Focus on: delivery reliability, team communication quality,
  professional language consistency, work pattern discipline
- Highlight: any patterns an employer would flag — missed 
  deadlines, communication gaps, irregular work hours
- Close with: an overall candidate reliability assessment
- Tone: structured HR language, like a formal reference check
- Example opening: "The candidate's professional digital record 
  across [N] platforms demonstrates consistent delivery behavior 
  with a [X]% commitment fulfillment rate. Communication quality 
  is generally professional across work platforms, though 
  [specific pattern] warrants attention in high-stakes 
  client-facing roles."
`,
  full: `
EXECUTIVE SUMMARY INSTRUCTIONS:
- Use mixed language — "you" for behavioral, "the subject" 
  for investor/professional sections
- Lead with: "A full-spectrum analysis across [N] platforms..."
- Cover ALL 4 dimensions explicitly in the narrative — 
  one sentence per dimension
- Include a per-dimension score grid in this section:
    Behavioral Dimension:         [X.X / 10.0]
    Investor / Reputation:        [X.X / 10.0]
    Hiring / Professional:        [X.X / 10.0]
    Cross-Platform Consistency:   [X.X / 10.0]
    ──────────────────────────────────────────
    COMPOSITE RISK SCORE:         [X.X / 10.0]
- Close with: a cross-platform consistency observation
- Tone: balanced, comprehensive, 360-degree review language
- Example opening: "A full-spectrum analysis of [N] platform 
  records over 24 months reveals a consistent behavioral 
  profile with low reputational exposure across all four 
  assessment dimensions. Behaviorally, [pattern]. From an 
  investor perspective, [pattern]. Professionally, [pattern]. 
  Cross-platform consistency is [HIGH/MEDIUM/LOW]."
`,
};

export const OPPORTUNITIES_INSTRUCTIONS: Record<string, string> = {
  behavioral: `
OPPORTUNITY GENERATION RULES (Behavioral Lens):
Generate exactly 3 opportunities. Each must:
- Be grounded in a SPECIFIC signal found in the connector data
- Reference a specific connector by name (not just "Verified Platform")
- Be actionable — describe a concrete behavior change
- Use "you" language
- Follow this format in JSON:
  {
    "title": "[Short action-oriented title]",
    "description": "[2 sentences: what the data shows + what to do about it]",
    "source": "[Specific platform name] connector (Record window: \${actualScanWindow})",
    "priority": "[High/Medium/Low]",
    "scoreReduction": "[Estimated risk score reduction points, e.g., -0.8 or -0.4]"
  }
`,
  reputation: `
OPPORTUNITY GENERATION RULES (Investor Lens):
Generate exactly 3 opportunities. Each must:
- Address a specific credibility gap found in the data
- Reference a specific connector and record window
- Frame the action as trust-building for an external investor
- Use formal language
- Follow this format in JSON:
  {
    "title": "[Short credibility-building title]",
    "description": "[2 sentences: what the gap is + what to do]",
    "source": "[Specific platform name] connector (Record window: \${actualScanWindow})",
    "priority": "[High/Medium/Low]",
    "scoreReduction": "[Estimated risk score reduction points, e.g., -0.8 or -0.4]"
  }
`,
  hiring: `
OPPORTUNITY GENERATION RULES (Hiring Lens):
Generate exactly 3 opportunities. Each must:
- Address a specific professional pattern from the data
- Reference a specific connector and record window
- Be framed as a career development action
- Use "candidate" or direct professional language
- Follow this format in JSON:
  {
    "title": "[Short professional development title]",
    "description": "[2 sentences: observed pattern + recommended action]",
    "source": "[Specific platform name] connector (Record window: \${actualScanWindow})",
    "priority": "[High/Medium/Low]",
    "scoreReduction": "[Estimated risk score reduction points, e.g., -0.8 or -0.4]"
  }
`,
  full: `
OPPORTUNITY GENERATION RULES (Full Audit Lens):
Generate exactly 4 opportunities — one per dimension.
Each must reference specific connector data and record window.
Tag each opportunity with its dimension:
  [BEHAVIORAL] / [INVESTOR] / [PROFESSIONAL] / [CROSS-PLATFORM]
- Follow this format in JSON:
  {
    "title": "[Short title prefixed with the dimension]",
    "description": "[Observed pattern + recommended action]",
    "source": "[Specific platform name] connector (Record window: \${actualScanWindow})",
    "priority": "[High/Medium/Low]",
    "scoreReduction": "[Estimated risk score reduction points, e.g., -0.8 or -0.4]"
  }
`,
};

export const CROSS_LENS_SECTION = `
MANDATORY SECTION FOR FULL AUDIT ONLY — § 8 CROSS-LENS CONSISTENCY:
You MUST generate a Cross-Lens Consistency Report as § 8 of the Full Reputation Audit. This section does NOT appear in any other lens. It must contain:

1. OVERALL CONSISTENCY RATING: HIGH / MEDIUM / LOW
   - HIGH: All platforms tell the same story, no contradictions
   - MEDIUM: Minor tone or timeline inconsistencies detected
   - LOW: Significant contradictions between platforms

2. DIMENSION SCORE VARIANCE: 
   Calculate: max(dimension_scores) - min(dimension_scores)
   If variance > 2.0, flag as "SIGNIFICANT VARIANCE DETECTED"

3. CONTRADICTION FLAGS (list each cross-platform contradiction):
   Format:
   Platform A: [platform + what was said/done + date]
   Platform B: [platform + conflicting signal + date]  
   Severity: HIGH / MEDIUM / LOW
   Description: [What exactly contradicts what]

4. CONSISTENCY NARRATIVE (3–4 sentences):
   Describe how the subject presents differently or similarly across contexts. Is their professional persona consistent with their informal persona? Do their stated timelines match their actual activity patterns?

5. CROSS-LENS IMPROVEMENT RECOMMENDATION (1 actionable item):
   One specific recommendation to improve cross-platform consistency, backed by evidence from the data.

If no contradictions are found, state:
"No significant cross-platform contradictions detected. The subject's digital behavior presents a consistent profile across all analyzed connectors and contexts."
`;

// Unify keywords for a comprehensive extraction pass (identical across all lenses to ensure strict determinism)
export const commitmentKeywords = /\b(will|i'll|we'll|i will|we will|i'll|going to|plan to|planning to|need to|have to|should|must|shall|promised|commit|deadline|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|eow|next week|tomorrow)|follow.?up|send|review|check|handle|take care|responsible for|assigned|action item|todo|to.do)\b/i;
export const sensitiveKeywords = /\b(salary|budget|invoice|payment|debt|legal|lawsuit|confidential|private|conflict|fired|quit|resign|burnout|stressed|anxiety|urgent|critical|emergency|overdue|missed|failed|broke|broken|issue|problem|complaint|dispute|disagree|delay|late|incomplete|pending|cancel|deadline|drift|dropped|slip|loops|angry|happy|sad|depressed|excited|furious|love|hate|dislike|upset|mad|frustrated|annoyed|disappoint|glad|awesome|terrible|bad|good|worst|best)\b/i;

// Unified extraction instruction (identical across all lenses to maintain strict data-layer consistency)
export const finalRiskInstruction = `
- Be precise and objective. Do not over-flag or hallucinate risks.
- REPUTATION RISKS ONLY: A reputation risk must be a genuine human behavior or integrity issue: interpersonal conflicts, broken commitments/promises to clients/colleagues, harassment, offensive conduct, ethical violations, leaked API keys/credentials, or legal disputes.
- NEVER flag standard security/system notification emails (e.g. "new sign-in detected on Vercel/Google account", "new device login alert", "password reset", "verification code", "security alert") as risks or sensitive. They are routine automated security operations, NOT reputation risks.
- NEVER flag personal resume submissions or CVs as PII exposure or risk. A resume naturally contains names and email addresses.
- NEVER flag standard OAuth authorizations or app connections (e.g. "Google account data shared with Slack", "Slack access granted") as risks. They are routine integration workflows, NOT data leaks.
- Treat automated notifications or emails from external parties as neutral (sentiment: 0), isSensitive: false, and isCommitment=false.
- CONTEXT-AWARE SENTIMENT: Conversations where the subject is actively debugging code, discussing technical bugs, compilation issues, or product errors (especially in developer platforms or Claude sessions) are standard software engineering activities. Classify them as neutral (sentiment: 0), NOT negative, unless there is a genuine interpersonal conflict, project failure, or professional misconduct.
- FALSE POSITIVES FILTER: Internal development and debugging sessions where the subject is discussing product issues to improve/debug EYES (e.g., discussing "contradictory data in executive summary" or "fixing the PDF generator") are self-improvement/product feedback loops, NOT reputational risks. Do NOT flag them as sensitive or risks.
- NORMAL TRANSACTION / RECEIVED EMAILS: Standard received transactions, service alerts, trial expirations, or social invites (e.g., birthday invitations) are neutral (sentiment: 0) and do NOT constitute PII exposures or security/reputation risks unless they expose raw secret credentials or financial account keys.
- STRICTION: Commands, queries, prompts, search terms, or instructions sent to AI systems (e.g. Claude, ChatGPT), search engines, or code compilers (like "remove final page", "make perfect doc", "search receipts") are NOT personal commitments or promises made by the subject. Set isCommitment=false for them. A commitment is only when the subject explicitly promises they will do an action themselves in the future.
`;
