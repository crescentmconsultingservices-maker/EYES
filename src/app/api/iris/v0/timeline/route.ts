import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoIso = ninetyDaysAgo.toISOString();

    // Check if the user is operating within an organization context
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('account_type, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const isOrgMode = profile?.account_type === 'organization' && profile?.organization_id;

    let queryBuilder = supabase
      .from('chronic_edges')
      .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)');

    if (!isOrgMode) {
      queryBuilder = queryBuilder.eq('user_id', user.id);
    }

    const { data, error } = await queryBuilder
      .gte('valid_from', ninetyDaysAgoIso)
      .order('valid_from', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching timeline data:', error);
      return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
    }

    const events = data || [];
    
    if (events.length > 0) {
      const memoryIds = events.map(e => e.source_record_id).filter(Boolean);
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
          
          events.forEach(e => {
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

    return NextResponse.json({ events }, { status: 200 });
  } catch (err) {
    console.error('Timeline API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
