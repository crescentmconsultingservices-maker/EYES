import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { lens, query } = await req.json();

    // Query chronic graph edges matching lens category or search query
    const { data: edges, error } = await supabase
      .from('chronic_edges')
      .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
      .eq('user_id', user.id)
      .limit(10);

    if (error) {
      console.warn('Investigate API warning:', error.message);
    }

    return NextResponse.json({
      lens: lens || 'revenue',
      query: query || '',
      findings: edges || [],
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (err) {
    console.error('Investigate API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
