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
        getAll() { return []; },
        setAll() {}
      },
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Onboarding Auth Error:', authError);
      return NextResponse.json({ error: 'Unauthorized user session' }, { status: 401 });
    }

    const body = await request.json();
    const { role, goals, persona, accountType, organizationName, existingOrgId, corporateDomain } = body;

    if (!role || !goals || !persona) {
      return NextResponse.json({ error: 'Missing required onboarding fields (role, goals, or persona)' }, { status: 400 });
    }

    let resolvedOrgId: string | null = null;

    if (accountType === 'organization') {
      if (existingOrgId) {
        // User joined an existing registered organization
        resolvedOrgId = existingOrgId;

        const { error: memberError } = await supabase
          .from('organization_members')
          .upsert({
            organization_id: resolvedOrgId,
            user_id: user.id,
            role: 'member'
          }, { onConflict: 'organization_id,user_id' });

        if (memberError) {
          console.error('Error joining organization member:', memberError);
          return NextResponse.json({ error: `Failed to join organization: ${memberError.message}` }, { status: 500 });
        }
      } else {
        // User creates a new organization
        if (!organizationName || !organizationName.trim()) {
          return NextResponse.json({ error: 'Organization name is required for organization account type' }, { status: 400 });
        }

        const trimmedName = organizationName.trim();
        const trimmedDomain = corporateDomain?.trim() || null;

        // Check if organization with corporate_domain already exists
        if (trimmedDomain) {
          const { data: existingDomainOrg } = await supabase
            .from('organizations')
            .select('id')
            .eq('corporate_domain', trimmedDomain)
            .maybeSingle();

          if (existingDomainOrg) {
            resolvedOrgId = existingDomainOrg.id;
          }
        }

        // If not found by domain, insert new organization
        if (!resolvedOrgId) {
          const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .insert({ 
              name: trimmedName,
              corporate_domain: trimmedDomain,
              privacy_shield_enabled: true
            })
            .select('id')
            .single();

          if (orgError || !orgData) {
            console.error('Error creating organization:', orgError);
            return NextResponse.json({ error: `Failed to create organization: ${orgError?.message || 'Database error'}` }, { status: 500 });
          }

          resolvedOrgId = orgData.id;
        }

        // Assign user as owner/member in organization_members
        const { error: memberError } = await supabase
          .from('organization_members')
          .upsert({
            organization_id: resolvedOrgId,
            user_id: user.id,
            role: 'owner'
          }, { onConflict: 'organization_id,user_id' });

        if (memberError) {
          console.error('Error adding organization owner:', memberError);
          return NextResponse.json({ error: `Failed to establish organization membership: ${memberError.message}` }, { status: 500 });
        }
      }
    }

    // Upsert user profile to ensure missing profile records are safely initialized
    const fallbackName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';

    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        name: fallbackName,
        role,
        goals,
        persona,
        account_type: accountType || 'individual',
        organization_id: resolvedOrgId,
        onboarding_completed: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error('Error updating onboarding preferences:', profileError);
      return NextResponse.json({ error: `Failed to update preferences: ${profileError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Onboarding API Error:', err);
    return NextResponse.json({ error: `Internal Server Error: ${err?.message || err}` }, { status: 500 });
  }
}
