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
      .select('id, head_node_id, tail_node_id, relation_label, confidence_score, evidence_text')
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
        type: 'custom', // We can define a custom node type later for styling
      });
    }

    edges?.forEach((edge) => {
      // Normalize heads/tails
      const sourceId = edge.head_node_id.replace(/_/g, ' ');
      const targetId = edge.tail_node_id.replace(/_/g, ' ');

      // Add Source Node if not exists
      if (!nodesMap.has(sourceId)) {
        nodesMap.set(sourceId, {
          id: sourceId,
          data: { label: sourceId },
          position: { x: 0, y: 0 }, // We will use Dagre on the frontend to calculate real positions
        });
      }

      // Add Target Node if not exists
      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, {
          id: targetId,
          data: { label: targetId },
          position: { x: 0, y: 0 },
        });
      }

      // Add Edge
      flowEdges.push({
        id: edge.id,
        source: sourceId,
        target: targetId,
        label: edge.relation_label,
        type: 'smoothstep', // Looks clean for structured graphs
        data: {
          evidence: edge.evidence_text,
          confidence: edge.confidence_score
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
