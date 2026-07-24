import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();
    
    // We need to fetch edges with their head and tail nodes to render human-readable claims
    // We will do 4 parallel queries

    // 1. Overnight Changes: any edges created/updated in the last 24h
    const { data: changesData } = await supabase
      .from('chronic_edges')
      .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
      .eq('user_id', user.id)
      .gte('updated_at', yesterdayIso)
      .order('updated_at', { ascending: false })
      .limit(5);

    // 2. Open Commitments: relation_label = 'commitment', valid_to is null
    const { data: commitmentsData } = await supabase
      .from('chronic_edges')
      .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
      .eq('user_id', user.id)
      .eq('relation_label', 'commitment')
      .is('valid_to', null)
      .order('valid_from', { ascending: false })
      .limit(10);

    // 3. Slipping: relation_label = 'delayed_on', valid_to is null
    const { data: slippingData } = await supabase
      .from('chronic_edges')
      .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
      .eq('user_id', user.id)
      .eq('relation_label', 'delayed_on')
      .is('valid_to', null)
      .order('valid_from', { ascending: false })
      .limit(10);

    // 4. On the horizon: items with valid_from in the future, or expected_on
    // For v0, let's look for expected_on relations or valid_from > now
    const nowIso = new Date().toISOString();
    const { data: horizonData } = await supabase
      .from('chronic_edges')
      .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
      .eq('user_id', user.id)
      .is('valid_to', null)
      .gt('valid_from', nowIso)
      .order('valid_from', { ascending: true })
      .limit(5);

    const allEdges = [
      ...(changesData || []),
      ...(commitmentsData || []),
      ...(slippingData || []),
      ...(horizonData || [])
    ];

    if (allEdges.length > 0) {
      const memoryIds = allEdges.map(e => e.source_record_id).filter(Boolean);
      if (memoryIds.length > 0) {
        const { data: memories } = await supabase
          .from('memories')
          .select('id, content, metadata')
          .in('id', memoryIds);
        
        if (memories) {
          const memoryMap = memories.reduce((acc, m) => {
            acc[m.id] = m;
            return acc;
          }, {} as Record<string, any>);
          
          allEdges.forEach(e => {
            if (e.source_record_id && memoryMap[e.source_record_id]) {
              e.memory_content = memoryMap[e.source_record_id].content;
              if (!e.source_url && memoryMap[e.source_record_id].metadata) {
                e.source_url = memoryMap[e.source_record_id].metadata.url || memoryMap[e.source_record_id].metadata.html_url || memoryMap[e.source_record_id].metadata.htmlLink || null;
              }
            }
          });
        }
      }
    }

    return NextResponse.json({
      overnightChanges: changesData || [],
      openCommitments: commitmentsData || [],
      slipping: slippingData || [],
      horizon: horizonData || []
    }, { status: 200 });

  } catch (err) {
    console.error('Morning brief API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
