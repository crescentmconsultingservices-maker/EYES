import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Maps UI lens names to chronic_edge relation labels
const LENS_RELATION_MAP: Record<string, string[]> = {
  revenue:     ['financial_transaction', 'commitment', 'goal'],
  people:      ['works_at', 'knows', 'family_of', 'friend_of', 'member_of'],
  commitments: ['commitment', 'delayed_on'],
  risks:       ['blocker', 'risk', 'dependency'],
  projects:    ['project', 'task', 'decision'],
  identity:    ['located_in', 'parent_of', 'child_of', 'spouse_of', 'sibling_of'],
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { lens, query } = await req.json();

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('account_type, organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const isOrgMode = profile?.account_type === 'organization' && profile?.organization_id;

    let queryBuilder = supabase
      .from('chronic_edges')
      .select('*, head:chronic_nodes!head_node_id(name, label), tail:chronic_nodes!tail_node_id(name, label)')
      .is('valid_to', null)
      .order('valid_from', { ascending: false })
      .limit(25);

    // Apply user scoping
    if (!isOrgMode) {
      queryBuilder = queryBuilder.eq('user_id', user.id);
    }

    // Apply lens filter — map UI lens to relation_label values
    const lensKey = (lens || '').toLowerCase();
    const relationsForLens = LENS_RELATION_MAP[lensKey];
    if (relationsForLens && relationsForLens.length > 0) {
      queryBuilder = queryBuilder.in('relation_label', relationsForLens);
    }

    // Apply text query — filter where head node name contains the query
    if (query && query.trim().length > 0) {
      const sanitized = query.trim().slice(0, 100);
      // Filter edges whose head OR tail node name matches the query
      // Supabase doesn't support OR across joins directly; use ilike on the label column as best-effort
      queryBuilder = queryBuilder.ilike('relation_label', `%${sanitized}%`);
    }

    const { data: edges, error } = await queryBuilder;

    if (error) {
      console.warn('Investigate API warning:', error.message);
    }

    // If text query present, post-filter by node name in JS (since Supabase join-filter ilike isn't available)
    let findings = edges || [];
    if (query && query.trim().length > 0) {
      const q = query.trim().toLowerCase();
      findings = findings.filter((e: any) =>
        e.head?.name?.toLowerCase().includes(q) ||
        e.tail?.name?.toLowerCase().includes(q) ||
        e.relation_label?.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      lens: lens || 'all',
      query: query || '',
      findings,
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (err) {
    console.error('Investigate API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
