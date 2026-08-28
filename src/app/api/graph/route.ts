import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseKey);
    // In a real app, we'd get the user_id from the session. 
    // Since we know the test user is thomasshelby251890@gmail.com, we can hardcode for testing, 
    // or allow a query param.
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '4d2f3e3c-b834-43fc-852a-c3cdbb535b68'; // Default to Thomas Shelby if none provided

    const [edgesRes, corrRes] = await Promise.all([
      supabase
        .from('chronic_edges')
        .select(`
          id, 
          relation_label, 
          confidence,
          head:head_node_id(id, name),
          tail:tail_node_id(id, name)
        `)
        .eq('user_id', userId)
        .is('valid_to', null)
        .limit(100),
      supabase
        .from('entity_correlations')
        .select('entity_id, entity_name')
        .eq('user_id', userId)
    ]);

    if (edgesRes.error) {
      console.error('Supabase error fetching graph:', edgesRes.error);
      return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
    }

    const edges = edgesRes.data;
    const correlations = corrRes.data;

    // Process into React Flow format
    const entityMap = new Map<string, string>();
    if (correlations) {
      correlations.forEach(c => {
        entityMap.set(c.entity_id, c.entity_name);
      });
    }

    const nodesMap = new Map<string, any>();
    const flowEdges: any[] = [];

    // Always add the central User node if there are edges
    if (edges && edges.length > 0) {
      nodesMap.set('User', {
        id: 'User',
        data: { label: 'You (The User)' },
        position: { x: 0, y: 0 },
        type: 'default',
      });
    }

    edges?.forEach((edge: any) => {
      // Normalize heads/tails with deduplication map
      const rawSourceId = edge.head?.id || 'User';
      const rawSourceLabel = edge.head?.name || 'You (The User)';
      
      const sourceId = entityMap.get(rawSourceId) || rawSourceId;
      const sourceLabel = entityMap.get(rawSourceId) || rawSourceLabel;
      
      const rawTargetId = edge.tail?.id || 'Unknown';
      const rawTargetLabel = edge.tail?.name || 'Unknown';
      
      const targetId = entityMap.get(rawTargetId) || rawTargetId;
      const targetLabel = entityMap.get(rawTargetId) || rawTargetLabel;

      // Add Source Node if not exists
      if (!nodesMap.has(sourceId)) {
        nodesMap.set(sourceId, {
          id: sourceId,
          data: { label: sourceLabel },
          position: { x: 0, y: 0 },
          type: 'default',
        });
      }

      // Add Target Node if not exists
      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, {
          id: targetId,
          data: { label: targetLabel },
          position: { x: 0, y: 0 },
          type: 'default',
        });
      }

      // Add Edge
      flowEdges.push({
        id: edge.id,
        source: sourceId,
        target: targetId,
        label: edge.relation_label,
        type: 'smoothstep',
        data: {
          evidence: 'Evidence logged in Audit Feed.',
          confidence: edge.confidence
        }
      });
    });

    const flowNodes = Array.from(nodesMap.values());

    return NextResponse.json({ nodes: flowNodes, edges: flowEdges });
  } catch (error) {
    console.error('Error in graph API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
