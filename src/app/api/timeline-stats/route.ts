import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve user IDs context (personal user or all organization members)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('organization_id, account_type')
      .eq('user_id', user.id)
      .maybeSingle();

    let orgId = profile?.organization_id;
    if (!orgId) {
      const { data: memberRecord } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (memberRecord?.organization_id) orgId = memberRecord.organization_id;
    }

    let userIds = [user.id];

    if (orgId) {
      const { data: orgMembers } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', orgId);

      if (orgMembers && orgMembers.length > 0) {
        userIds = Array.from(new Set([user.id, ...orgMembers.map(m => m.user_id)]));
      }
    }

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 9 }, (_, i) => currentYear - (8 - i));

    const statsPromises = years.map(async (year) => {
      const start = `${year}-01-01T00:00:00Z`;
      const end = `${year}-12-31T23:59:59Z`;

      const { count, error } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .in('user_id', userIds)
        .gte('timestamp', start)
        .lte('timestamp', end);

      if (error) throw error;
      return { year: year.toString(), count: count || 0 };
    });

    const timelineData = await Promise.all(statsPromises);

    return NextResponse.json({ timelineData });
  } catch (err) {
    console.warn('Timeline stats error:', err);
    return NextResponse.json({ timelineData: [] }, { status: 200 });
  }
}
