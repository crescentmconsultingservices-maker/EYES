import { createAdminClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';
import { AuditLens } from '@/types/dashboard';

export type ValidLensType = 'full' | 'investor' | 'reputation' | 'hiring' | 'behavioral';

export function normalizeLensType(type: string): 'full' | 'investor' | 'hiring' | 'behavioral' {
  const lower = (type || 'full').toLowerCase().trim();
  if (lower === 'reputation' || lower === 'investor') return 'investor';
  if (lower === 'hiring') return 'hiring';
  if (lower === 'behavioral') return 'behavioral';
  return 'full';
}

export class AuditLensService {
  /**
   * Fetch an existing lens or generate it on-demand using cached extracted_findings.
   */
  static async getOrCreateLens(
    auditId: string,
    rawLensType: string,
    userId: string
  ): Promise<AuditLens> {
    const lensType = normalizeLensType(rawLensType);
    const supabase = await createAdminClient();

    // 1. Check if audit exists and belongs to user
    const { data: audit, error: auditError } = await supabase
      .from('reputation_audits')
      .select('id, user_id, status, risk_score, summary_narrative, metadata, extracted_findings')
      .eq('id', auditId)
      .eq('user_id', userId)
      .maybeSingle();

    if (auditError || !audit) {
      throw new Error('Audit not found or access denied.');
    }

    // 2. Check if this lens has already been generated
    const { data: existingLens } = await supabase
      .from('audit_lenses')
      .select('*')
      .eq('audit_id', auditId)
      .in('lens_type', [lensType, lensType === 'investor' ? 'reputation' : lensType])
      .maybeSingle();

    if (existingLens) {
      return {
        id: existingLens.id,
        auditId: existingLens.audit_id,
        lensType: normalizeLensType(existingLens.lens_type),
        riskScore: Number(existingLens.risk_score || 0),
        narrative: existingLens.narrative || '',
        metadata: existingLens.metadata || {},
        generatedAt: existingLens.generated_at,
      };
    }

    // 3. If not generated, audit must be completed with extracted_findings
    if (audit.status !== 'completed') {
      throw new Error('Audit is not yet completed. Lenses cannot be generated until extraction is complete.');
    }

    const findings = (audit.extracted_findings || {}) as Record<string, any>;
    const baseRiskScore = Number(audit.risk_score || 0);

    // If lensType is 'full' and audit has a summary narrative, we can use it as base
    if (lensType === 'full' && audit.summary_narrative) {
      const { data: inserted, error: insertError } = await supabase
        .from('audit_lenses')
        .insert({
          audit_id: auditId,
          lens_type: 'full',
          risk_score: baseRiskScore,
          narrative: audit.summary_narrative,
          metadata: { generatedReason: 'base_full' },
        })
        .select()
        .single();

      if (!insertError && inserted) {
        return {
          id: inserted.id,
          auditId: inserted.audit_id,
          lensType: 'full',
          riskScore: Number(inserted.risk_score || 0),
          narrative: inserted.narrative || '',
          metadata: inserted.metadata || {},
          generatedAt: inserted.generated_at,
        };
      }
    }

    // 4. Generate lens on demand using cheap AI call with extracted_findings
    const generated = await this.generateLensNarrativeAndScore(lensType, findings, baseRiskScore);

    // 5. Store newly generated lens in audit_lenses
    const { data: newLens, error: saveError } = await supabase
      .from('audit_lenses')
      .upsert({
        audit_id: auditId,
        lens_type: lensType,
        risk_score: generated.riskScore,
        narrative: generated.narrative,
        metadata: generated.metadata,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'audit_id, lens_type' })
      .select()
      .single();

    if (saveError || !newLens) {
      console.error('[AuditLensService] Error saving lens:', saveError);
      return {
        id: `lens-${Date.now()}`,
        auditId,
        lensType,
        riskScore: generated.riskScore,
        narrative: generated.narrative,
        metadata: generated.metadata,
        generatedAt: new Date().toISOString(),
      };
    }

    return {
      id: newLens.id,
      auditId: newLens.audit_id,
      lensType: normalizeLensType(newLens.lens_type),
      riskScore: Number(newLens.risk_score || 0),
      narrative: newLens.narrative || '',
      metadata: newLens.metadata || {},
      generatedAt: newLens.generated_at,
    };
  }

  /**
   * Fetch all generated lenses for an audit
   */
  static async getAllLensesForAudit(auditId: string): Promise<Record<string, AuditLens>> {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from('audit_lenses')
      .select('*')
      .eq('audit_id', auditId);

    const result: Record<string, AuditLens> = {};
    if (data) {
      for (const row of data) {
        const norm = normalizeLensType(row.lens_type);
        result[norm] = {
          id: row.id,
          auditId: row.audit_id,
          lensType: norm,
          riskScore: Number(row.risk_score || 0),
          narrative: row.narrative || '',
          metadata: row.metadata || {},
          generatedAt: row.generated_at,
        };
      }
    }
    return result;
  }

  /**
   * Run targeted, cheap AI call to generate narrative and calibrated score for a lens
   */
  private static async generateLensNarrativeAndScore(
    lensType: 'full' | 'investor' | 'hiring' | 'behavioral',
    findings: Record<string, any>,
    baseRiskScore: number
  ): Promise<{ riskScore: number; narrative: string; metadata: Record<string, any> }> {
    const commitments = findings.commitments || [];
    const flaggedItems = findings.flagged_items || findings.riskFindings || [];
    const entities = findings.entities || findings.topEntities || [];
    const sentiment = findings.sentiment || {};
    const connectors = findings.connectors_covered || [];
    const mentionsCount = findings.mentions_count || 0;

    let lensPersona = '';
    let lensFocus = '';
    let scoreMultiplier = 1.0;

    if (lensType === 'investor') {
      lensPersona = 'You are an institutional due diligence analyst evaluating founder and executive risk for venture/private equity investors.';
      lensFocus = 'Focus specifically on financial commitments, roadmap integrity, commercial follow-through, delivery timelines, and legal/financial exposure. Scrutinize whether stated promises to stakeholders were delivered.';
      // Investor lens weights unfulfilled commitments heavier
      scoreMultiplier = 1.1;
    } else if (lensType === 'hiring') {
      lensPersona = 'You are an executive talent evaluator and senior HR intelligence auditor.';
      lensFocus = 'Focus on workplace communication etiquette, team collaboration friction, operational reliability, delivery consistency, professional boundary maintenance, and leadership dependability.';
      scoreMultiplier = 0.95;
    } else if (lensType === 'behavioral') {
      lensPersona = 'You are a cognitive behavioral auditor and clinical personal development analyst.';
      lensFocus = 'Focus on work-rest cycles, late-night communication patterns, stress indicators, linguistic tone drift, responsiveness, emotional regulation, and self-consistency between stated intentions and execution.';
      scoreMultiplier = 1.0;
    } else {
      lensPersona = 'You are a comprehensive 360-degree forensic digital intelligence analyst.';
      lensFocus = 'Synthesize all dimensions: external stakeholder credibility, professional peer reliability, and personal cognitive consistency.';
      scoreMultiplier = 1.0;
    }

    // Calibrate lens risk score
    let calculatedScore = Math.min(10, Math.max(0, Number((baseRiskScore * scoreMultiplier).toFixed(1))));
    if (flaggedItems.length === 0 && commitments.filter((c: any) => c.status === 'pending').length === 0) {
      calculatedScore = 0.0;
    }

    const prompt = `${lensPersona}
Your role is to produce a focused, clinical assessment through the "${lensType.toUpperCase()}" lens using the pre-extracted forensic data below.
${lensFocus}

Forensic Summary:
- Total records scanned: ${mentionsCount} across platforms: ${connectors.join(', ')}
- Entities detected: ${entities.slice(0, 8).join(', ') || 'None'}
- Open/Pending commitments: ${commitments.filter((c: any) => c.status === 'pending').length} of ${commitments.length} total
- Flagged risk items: ${flaggedItems.length}
- Sentiment balance: ${sentiment.balance ? Math.round(sentiment.balance * 100) : 100}% positive/neutral alignment
- Sample commitments: ${JSON.stringify(commitments.slice(0, 5))}
- Sample flagged items: ${JSON.stringify(flaggedItems.slice(0, 5))}

Tone: Objective, clinical, decisive. Do not use generic flattery or filler. State facts directly grounded in the findings.
Provide:
1. narrative: A concise, impactful 2-3 paragraph executive assessment framed specifically through this lens.
2. riskScore: A calibrated risk score between 0.0 and 10.0 (where 0 is spotless and 10 is severe risk).

Return strictly JSON format:
{
  "narrative": "...",
  "riskScore": ${calculatedScore}
}`;

    try {
      const response = await invokeModel({
        capability: 'chat',
        preference: 'auto',
        messages: [{ role: 'user', content: prompt }],
        system: 'You are a clinical intelligence analyst. Return valid JSON only.',
        maxTokens: 1200,
      });

      if (typeof response === 'string') {
        const match = response.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          return {
            riskScore: typeof parsed.riskScore === 'number' ? Number(parsed.riskScore.toFixed(1)) : calculatedScore,
            narrative: parsed.narrative || this.buildFallbackNarrative(lensType, calculatedScore, mentionsCount, connectors),
            metadata: {
              lensType,
              generatedAt: new Date().toISOString(),
              entitiesAnalyzed: entities.slice(0, 5),
            },
          };
        }
      }
    } catch (err) {
      console.warn(`[AuditLensService] AI generation error for ${lensType}, using fallback:`, err);
    }

    return {
      riskScore: calculatedScore,
      narrative: this.buildFallbackNarrative(lensType, calculatedScore, mentionsCount, connectors),
      metadata: { fallback: true },
    };
  }

  private static buildFallbackNarrative(
    lensType: string,
    score: number,
    count: number,
    connectors: string[]
  ): string {
    const connStr = connectors.join(', ') || 'connected vaults';
    const exposure = score <= 2.5 ? 'minimal exposure' : score <= 5.5 ? 'moderate exposure' : 'elevated risk indicators';
    if (lensType === 'investor') {
      return `Analysis of ${count} records across ${connStr} indicates a risk score of ${score}/10 with ${exposure} for external stakeholder and investor review. Commercial commitments and milestone delivery patterns demonstrate consistent follow-through.`;
    }
    if (lensType === 'hiring') {
      return `Professional workplace audit across ${connStr} reflects a score of ${score}/10 (${exposure}). Operational collaboration and team communication signals exhibit reliable delivery habits without critical peer friction.`;
    }
    if (lensType === 'behavioral') {
      return `Personal self-reflection audit across ${connStr} reveals a behavioral risk score of ${score}/10 (${exposure}). Response latency and communication rhythms remain steady across active quarters.`;
    }
    return `Comprehensive multi-source audit encompassing ${count} records across ${connStr} records an overall score of ${score}/10 (${exposure}). Integrity metrics confirm adherence across primary platforms.`;
  }
}
