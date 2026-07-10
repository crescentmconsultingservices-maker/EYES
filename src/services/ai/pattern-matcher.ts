import { SEEDED_PATTERNS, SeededPattern } from '../../config/seed_patterns';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Represents the structured graph data extracted by the Chronic Layer (GLiNER/GLiREL).
 * This will eventually be queried directly from Neo4j.
 */
export interface UserGraphData {
  userId: string;
  entities: {
    projects: string[];
    commitments: string[];
    goals: string[];
    people: string[];
  };
  metrics: {
    commitmentsToOthersCompleted: number;
    commitmentsToOthersTotal: number;
    commitmentsToSelfCompleted: number;
    commitmentsToSelfTotal: number;
    projectsStarted: number;
    projectsShipped: number;
    researchMentions: number;
  };
  recentEdges: { head: string; label: string; tail: string }[];
}

export interface PatternMatchResult {
  pattern: SeededPattern;
  confidence: number; // 0.0 to 1.0
  evidence: string[]; // Specific graph nodes/edges that triggered this
}

/**
 * Signal Detection Engine
 * Evaluates the user's raw graph data against the Seeded Pattern Library to detect early life-shapes.
 */
export class PatternMatcher {
  
  /**
   * Evaluates the Cold Start patterns for a user based on their initial data sync.
   * @param graphData The raw entities and relations extracted from the user's first sync.
   * @returns An array of matched patterns with confidence scores.
   */
  public static evaluateColdStart(graphData: UserGraphData): PatternMatchResult[] {
    const matches: PatternMatchResult[] = [];

    // 1. Evaluate THE_LOOP (The Builder's Loop)
    if (graphData.metrics.projectsStarted >= 3 && graphData.metrics.projectsShipped === 0) {
      matches.push({
        pattern: SEEDED_PATTERNS.find(p => p.code === 'THE_LOOP')!,
        confidence: 0.85,
        evidence: [
          `Detected ${graphData.metrics.projectsStarted} started projects.`,
          `Detected 0 shipped/completed projects.`,
          `Projects: ${graphData.entities.projects.join(', ')}`
        ]
      });
    }

    // 2. Evaluate ORBIT (Executes for Others, Orbits Own Work)
    const otherCompletionRate = graphData.metrics.commitmentsToOthersTotal > 0 
      ? graphData.metrics.commitmentsToOthersCompleted / graphData.metrics.commitmentsToOthersTotal 
      : 0;
    
    const selfCompletionRate = graphData.metrics.commitmentsToSelfTotal > 0 
      ? graphData.metrics.commitmentsToSelfCompleted / graphData.metrics.commitmentsToSelfTotal 
      : 0;

    if (otherCompletionRate > 0.8 && selfCompletionRate < 0.3 && graphData.metrics.commitmentsToSelfTotal > 2) {
      matches.push({
        pattern: SEEDED_PATTERNS.find(p => p.code === 'ORBIT')!,
        confidence: 0.9,
        evidence: [
          `Completion rate for external commitments: ${(otherCompletionRate * 100).toFixed(0)}%`,
          `Completion rate for internal/self commitments: ${(selfCompletionRate * 100).toFixed(0)}%`
        ]
      });
    }

    // 3. Evaluate AVOIDANCE (Avoidance-via-Research)
    if (graphData.metrics.researchMentions > 10 && selfCompletionRate < 0.3) {
       matches.push({
        pattern: SEEDED_PATTERNS.find(p => p.code === 'AVOIDANCE')!,
        confidence: 0.75,
        evidence: [
          `High volume of research/learning mentions (${graphData.metrics.researchMentions}).`,
          `Co-occurring with stalled self-directed commitments.`
        ]
      });
    }

    // (Additional pattern detection logic will be wired here as the graph schema expands)

    return matches;
  }

  /**
   * Temporal Edge Invalidation (Supabase Implementation)
   * Evaluates active graph edges against recent contradictions.
   * If a user makes a new decision that contradicts an older active commitment,
   * the older edge is invalidated (decayed).
   */
  public static async validateOngoingPatterns(userId: string, supabase: SupabaseClient): Promise<number> {
    // 1. Fetch active commitments
    const { data: commitments } = await supabase
      .from('chronic_edges')
      .select('id, tail_node_id')
      .eq('user_id', userId)
      .eq('relation_label', 'commitment')
      .is('valid_to', null);

    if (!commitments || commitments.length === 0) return 0;

    // 2. Fetch active contradictions (e.g., User decided to drop/scrap a path)
    const { data: contradictions } = await supabase
      .from('chronic_edges')
      .select('tail_node_id')
      .eq('user_id', userId)
      .eq('relation_label', 'decided_against')
      .is('valid_to', null);

    if (!contradictions || contradictions.length === 0) return 0;

    const contradictionTails = new Set(contradictions.map(c => c.tail_node_id));
    
    // 3. Find commitments that share the exact same target as a recent 'decided_against'
    const edgesToInvalidate = commitments
      .filter(c => contradictionTails.has(c.tail_node_id))
      .map(c => c.id);

    // 4. Invalidate the old edges so the Mindmap is updated
    if (edgesToInvalidate.length > 0) {
      await supabase
        .from('chronic_edges')
        .update({ valid_to: new Date().toISOString() })
        .in('id', edgesToInvalidate);
    }

    return edgesToInvalidate.length;
  }
}
