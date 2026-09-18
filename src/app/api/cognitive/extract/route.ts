import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getOrCreateNodeId } from '@/utils/supabase/graph';


export const dynamic = 'force-dynamic';

/**
 * POST /api/cognitive/extract
 *
 * TypeScript → Python Engine bridge.
 * Accepts a { memoryId } in the request body, fetches the memory content,
 * calls the GLiNER FastAPI engine at CHRONIC_ENGINE_URL/extract,
 * and writes the resulting entities and relations to chronic_edges.
 *
 * Called automatically after platform syncs (via platform-sync.ts) or
 * manually triggered from the dashboard for specific memories.
 *
 * H-NEW-1 fix: this is the missing bridge that activates the Chronic Layer end-to-end.
 */

const MODAL_GLINER_URL = process.env.MODAL_GLINER_URL || process.env.MODAL_WEBHOOK_URL;
const CHRONIC_ENGINE_URL = (process.env.CHRONIC_ENGINE_URL || 'http://localhost:8000').replace(/\/$/, '');
const CHRONIC_ENGINE_SECRET = process.env.CHRONIC_ENGINE_SECRET || '';

const DEFAULT_ENTITY_LABELS = [
  'person', 'organization', 'place', 'project',
  'commitment', 'decision', 'goal', 'emotional_state',
  'event', 'topic', 'document', 'financial_transaction',
  'task', 'blocker'
];

interface EngineEntity {
  label: string;
  text: string;
  score: number;
  start: number;
  end: number;
}

interface EngineRelation {
  head: string;
  label: string;
  tail: string;
  score: number;
}

interface EngineResponse {
  entities: EngineEntity[];
  relations: EngineRelation[];
}

export async function POST(request: Request) {
  try {
    // ── 1. Auth check ───────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { memoryId, text: rawText } = body as { memoryId?: string; text?: string };

    if (!memoryId && !rawText) {
      return NextResponse.json(
        { error: 'Provide either memoryId or text in the request body.' },
        { status: 400 }
      );
    }

    // ── 2. Fetch memory content if memoryId was provided ────────────────────
    const admin = createAdminClient();
    let contentToExtract = rawText || '';
    let platform = 'manual';
    const sourceMemoryId = memoryId || null;

    if (memoryId) {
      const { data: memory, error: memErr } = await admin
        .from('memories')
        .select('id, content, title, platform, user_id')
        .eq('id', memoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memErr || !memory) {
        return NextResponse.json({ error: 'Memory not found or access denied.' }, { status: 404 });
      }

      contentToExtract = [memory.title, memory.content].filter(Boolean).join('\n').slice(0, 4000);
      platform = memory.platform || 'unknown';
    }

    if (!contentToExtract.trim()) {
      return NextResponse.json({ error: 'No content to extract from.' }, { status: 400 });
    }

    // ── 3. Extract Entities via Modal Cloud Engine (or local Chronic Engine) ───
    let entities: EngineEntity[] = [];
    let relations: EngineRelation[] = [];

    // Attempt 1: Call Modal Cloud GLiNER if configured
    if (MODAL_GLINER_URL) {
      try {
        const modalRes = await fetch(MODAL_GLINER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: contentToExtract,
            labels: DEFAULT_ENTITY_LABELS,
          }),
          signal: AbortSignal.timeout(20_000),
        });

        if (modalRes.ok) {
          const mData = await modalRes.json();
          entities = mData.entities || [];
          relations = mData.relations || [];
          console.log(`[Cognitive/Extract] Modal Cloud extracted ${entities.length} entities.`);
        }
      } catch (modalErr) {
        console.warn('[Cognitive/Extract] Modal Cloud call skipped/failed:', modalErr);
      }
    }

    // Attempt 2: If Modal was not configured or returned no entities, try local Python Chronic Engine
    if (entities.length === 0 && !relations.length && CHRONIC_ENGINE_URL) {
      try {
        const engineHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (CHRONIC_ENGINE_SECRET) engineHeaders['X-Engine-Secret'] = CHRONIC_ENGINE_SECRET;

        const engineRes = await fetch(`${CHRONIC_ENGINE_URL}/extract`, {
          method: 'POST',
          headers: engineHeaders,
          body: JSON.stringify({
            user_id: user.id,
            platform_id: platform,
            text: contentToExtract,
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (engineRes.ok) {
          const engineData = await engineRes.json() as EngineResponse;
          entities = engineData.entities || [];
          relations = engineData.relations || [];
        }
      } catch (localErr) {
        console.warn('[Cognitive/Extract] Local Chronic engine unavailable:', localErr);
      }
    }

    // Attempt 3: Speech-act relationship extraction via AI Gateway if relations are empty
    if (!relations.length) {
      const speechActRegex = /\b(i'll|we'll|let me|count on me|leave it (with|to)|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|eod|eow|next week|tonight)|will|promise|waiting|blocked|stuck|still hasn't|delay|delayed|haven't|hasn't|late|missed|behind|pass on|drop|kill|scrap|opted not|decide|decided|resolved)\b/i;
      
      if (speechActRegex.test(contentToExtract)) {
        try {
          const { invokeModel } = await import('@/services/ai/ai');
          const entityList = entities.map(e => `[${e.label}] ${e.text}`).join(', ');
          const system = `You are a bitemporal relationship extraction engine. Extract commitments, delays, and decisions. Entities detected: ${entityList || 'none'}. Return a JSON array of objects with fields: head (string), label (one of: promised_to, delayed_on, decided_to, blocked_by, assigned_to), tail (string), score (0.0 to 1.0). Return JSON ONLY: [{"head": "...", "label": "...", "tail": "...", "score": 0.9}]. If none, return [].`;
          
          const rawResult = await invokeModel({
            capability: 'extract',
            messages: [{ role: 'user', content: contentToExtract }],
            system,
          });

          if (rawResult && typeof rawResult === 'string') {
            const cleanJson = rawResult.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed)) {
              relations = parsed;
            }
          }
        } catch (aiErr) {
          console.warn('[Cognitive/Extract] AI Gateway relation extraction note:', aiErr);
        }
      }
    }

    // ── 4. Write relations to chronic_edges ─────────────────────────────────
    // The Python engine already handles contradictions internally,
    // but we also persist new edges here so the graph is always up to date.
    let edgesWritten = 0;
    const edgeErrors: string[] = [];

    // Helper function to find entity label and span offsets
    const findEntityMeta = (text: string): { label: string; start: number; end: number } => {
      const cleanText = text.toLowerCase().trim();
      const match = entities.find((e) => e.text.toLowerCase().trim() === cleanText);
      return match ? { label: match.label, start: match.start, end: match.end } : { label: 'other', start: 0, end: 0 };
    };

    // Batch node lookups — collect all unique node names across all relations first
    const validRelations = relations.filter((r) => r.head && r.label && r.tail);
    const uniqueNodeNames = [...new Set(validRelations.flatMap((r) => [r.head, r.tail]))];

    // Fetch existing nodes in one query
    const nodeIdCache = new Map<string, string>();
    if (uniqueNodeNames.length > 0) {
      const { data: existingNodes } = await admin
        .from('chronic_nodes')
        .select('id, name')
        .eq('user_id', user.id)
        .in('name', uniqueNodeNames);

      for (const node of existingNodes || []) {
        nodeIdCache.set(node.name.toLowerCase().trim(), node.id);
      }
    }

    // Create any missing nodes
    const missingNames = uniqueNodeNames.filter((n) => !nodeIdCache.has(n.toLowerCase().trim()));
    for (const name of missingNames) {
      const { label } = findEntityMeta(name);
      const id = await getOrCreateNodeId(admin, user.id, name, label);
      nodeIdCache.set(name.toLowerCase().trim(), id);
    }

    for (const rel of validRelations) {
      try {
        const headNodeId = nodeIdCache.get(rel.head.toLowerCase().trim());
        const tailNodeId = nodeIdCache.get(rel.tail.toLowerCase().trim());
        if (!headNodeId || !tailNodeId) continue;

        const { start: startChar, end: endChar } = findEntityMeta(rel.head);
        const recordId = sourceMemoryId || 'manual';

        // Check if this exact edge already exists (active)
        const { data: existing } = await admin
          .from('chronic_edges')
          .select('id, tail_node_id')
          .eq('user_id', user.id)
          .eq('head_node_id', headNodeId)
          .eq('relation_label', rel.label)
          .is('valid_to', null)
          .maybeSingle();

        if (existing) {
          if (existing.tail_node_id === tailNodeId) {
            // Identical edge — skip (already in graph)
            continue;
          }
          // Contradiction detected — invalidate the old edge
        }

        // Insert the new edge
        const { data: newEdge, error: insertErr } = await admin
          .from('chronic_edges')
          .insert({
            user_id: user.id,
            head_node_id: headNodeId,
            relation_label: rel.label,
            tail_node_id: tailNodeId,
            confidence: Math.min(1, Math.max(0, rel.score || 0.7)),
            source_record_id: recordId,
            chunk_start_char: startChar,
            chunk_end_char: endChar,
            valid_from: new Date().toISOString(),
            valid_to: null,
            is_contradicted_by: null,
          })
          .select('id')
          .single();

        if (insertErr) {
          edgeErrors.push(`${rel.head}→${rel.tail}: ${insertErr.message}`);
        } else {
          edgesWritten++;

          // If there was an existing contradicting edge, update it to point to the new edge
          if (existing) {
            await admin
              .from('chronic_edges')
              .update({
                valid_to: new Date().toISOString(),
                is_contradicted_by: newEdge.id,
              })
              .eq('id', existing.id);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        edgeErrors.push(`${rel.head}→${rel.tail}: ${errMsg}`);
      }
    }

    // ── 5. Mark memory as cognitively processed ─────────────────────────────
    if (sourceMemoryId) {
      await admin
        .from('memories')
        .update({ cognitive_processed_at: new Date().toISOString() })
        .eq('id', sourceMemoryId)
        .eq('user_id', user.id);
    }

    console.log(
      `[Cognitive/Extract] user=${user.id.slice(0, 8)} ` +
      `entities=${entities.length} relations=${relations.length} ` +
      `edges_written=${edgesWritten} errors=${edgeErrors.length}`
    );

    return NextResponse.json({
      ok: true,
      memoryId: sourceMemoryId,
      entities_found: entities.length,
      relations_found: relations.length,
      edges_written: edgesWritten,
      edge_errors: edgeErrors.length > 0 ? edgeErrors : undefined,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Cognitive/Extract] Fatal error:', msg);
    return NextResponse.json({ error: 'Internal server error', detail: msg }, { status: 500 });
  }
}
