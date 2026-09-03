import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { searchParams } = new URL(request.url);
    let targetUserId = searchParams.get('userId') || user?.id;

    let userIds = targetUserId ? [targetUserId] : (user ? [user.id] : []);

    const adminUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const adminClient = adminUrl && adminKey ? createAdminClient(adminUrl, adminKey) : supabase;

    const [edgesRes, corrRes, clustersRes] = await Promise.all([
      adminClient
        .from('chronic_edges')
        .select(`
          id, 
          relation_label, 
          confidence,
          head:head_node_id(id, name),
          tail:tail_node_id(id, name)
        `)
        .in('user_id', userIds)
        .is('valid_to', null)
        .limit(150),
      adminClient
        .from('entity_correlations')
        .select('entity_id, entity_name')
        .in('user_id', userIds),
      adminClient
        .from('cognitive_clusters')
        .select('id, cluster_label, cluster_description, characteristics, occurrence_count')
        .in('user_id', userIds)
        .eq('is_current', true)
    ]);

    if (edgesRes.error) {
      console.warn('Supabase error fetching graph:', edgesRes.error);
      return NextResponse.json({ nodes: [], edges: [], clusters: [] }, { status: 200 });
    }

    const edges = edgesRes.data || [];
    const correlations = corrRes.data || [];
    const clusters = clustersRes.data || [];

    // Process into React Flow & 3D Graph format
    const entityMap = new Map<string, string>();
    correlations.forEach(c => {
      entityMap.set(c.entity_id, c.entity_name);
    });

    const nodesMap = new Map<string, any>();
    const flowEdges: any[] = [];

    // Always add the central User node if there are edges or clusters
    if (edges.length > 0 || clusters.length > 0) {
      nodesMap.set('User', {
        id: 'User',
        data: { label: 'You (The User)' },
        position: { x: 0, y: 0 },
        type: 'default',
      });
    }

    // Add Cognitive Cluster Hub Nodes from batch_leiden.py
    clusters.forEach((cls: any) => {
      const clusterNodeId = `cluster-${cls.id}`;
      nodesMap.set(clusterNodeId, {
        id: clusterNodeId,
        data: {
          label: `🧠 ${cls.cluster_label}`,
          description: cls.cluster_description,
          occurrenceCount: cls.occurrence_count
        },
        position: { x: 0, y: 0 },
        type: 'clusterHub',
      });

      // Tie Cluster Hub to User node
      flowEdges.push({
        id: `user-cluster-${cls.id}`,
        source: 'User',
        target: clusterNodeId,
        label: 'COGNITIVE_CLUSTER',
        type: 'smoothstep',
        data: { confidence: 0.95 }
      });
    });

    edges.forEach((edge: any) => {
      const rawSourceId = edge.head?.id || 'User';
      const rawSourceLabel = edge.head?.name || 'You (The User)';
      
      const sourceId = entityMap.get(rawSourceId) || rawSourceId;
      const sourceLabel = entityMap.get(rawSourceId) || rawSourceLabel;
      
      const rawTargetId = edge.tail?.id || 'Unknown';
      const rawTargetLabel = edge.tail?.name || 'Unknown';
      
      const targetId = entityMap.get(rawTargetId) || rawTargetId;
      const targetLabel = entityMap.get(rawTargetId) || rawTargetLabel;

      if (!nodesMap.has(sourceId)) {
        nodesMap.set(sourceId, {
          id: sourceId,
          data: { label: sourceLabel },
          position: { x: 0, y: 0 },
          type: 'default',
        });
      }

      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, {
          id: targetId,
          data: { label: targetLabel },
          position: { x: 0, y: 0 },
          type: 'default',
        });
      }

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

    return NextResponse.json({
      nodes: flowNodes,
      edges: flowEdges,
      clusters: clusters
    });
  } catch (error) {
    console.error('Error in graph API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
