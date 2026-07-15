import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  try {
    // In a real app, we'd get the user_id from the session. 
    // Since we know the test user is thomasshelby251890@gmail.com, we can hardcode for testing, 
    // or allow a query param.
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || '4d2f3e3c-b834-43fc-852a-c3cdbb535b68'; // Default to Thomas Shelby if none provided

    const { data: edges, error } = await supabase
      .from('chronic_edges')
      .select(`
        id, 
        relation_label, 
        confidence, 
        evidence_text,
        head:head_node_id(id, name),
        tail:tail_node_id(id, name)
      `)
      .eq('user_id', userId)
      .is('valid_to', null)
      .limit(100);

    if (error) {
      console.error('Supabase error fetching graph:', error);
      return NextResponse.json({ error: 'Failed to fetch graph data' }, { status: 500 });
    }

    // Process into React Flow format
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
      // Normalize heads/tails
      const sourceId = edge.head?.id || 'User';
      const sourceLabel = edge.head?.name || 'You (The User)';
      const targetId = edge.tail?.id || 'Unknown';
      const targetLabel = edge.tail?.name || 'Unknown';

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
          evidence: edge.evidence_text,
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
