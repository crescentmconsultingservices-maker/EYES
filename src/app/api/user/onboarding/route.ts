import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '')?.trim();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return [] },
        setAll() {}
      },
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { role, goals, persona, accountType, organizationName, existingOrgId, corporateDomain } = body;

    if (!role || !goals || !persona) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let resolvedOrgId: string | null = null;

    if (accountType === 'organization') {
      if (existingOrgId) {
        // User joined an existing registered organization
        resolvedOrgId = existingOrgId;

        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: resolvedOrgId,
            user_id: user.id,
            role: 'member'
          });

        if (memberError && !memberError.message.includes('duplicate')) {
          console.error('Error joining organization member:', memberError);
          return NextResponse.json({ error: 'Failed to join organization' }, { status: 500 });
        }
      } else {
        // User creates a new organization
        if (!organizationName) {
          return NextResponse.json({ error: 'Organization name is required for organization account type' }, { status: 400 });
        }

        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert({ 
            name: organizationName.trim(),
            corporate_domain: corporateDomain?.trim() || null,
            privacy_shield_enabled: true
          })
          .select('id')
          .single();

        if (orgError || !orgData) {
          console.error('Error creating organization:', orgError);
          return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
        }

        resolvedOrgId = orgData.id;

        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: resolvedOrgId,
            user_id: user.id,
            role: 'owner'
          });

        if (memberError) {
          console.error('Error adding organization owner:', memberError);
          return NextResponse.json({ error: 'Failed to establish organization membership' }, { status: 500 });
        }
      }
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({
        role,
        goals,
        persona,
        account_type: accountType || 'individual',
        organization_id: resolvedOrgId,
        onboarding_completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating onboarding preferences:', error);
      return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Onboarding API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
