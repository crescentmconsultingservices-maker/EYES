import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'protonmail.com', 'aol.com', 'zoho.com', 'mail.com', 'gmx.com', 'yandex.com'
]);

function formatDomainToName(domain: string): string {
  const parts = domain.split('.')[0];
  return parts
    .split(/[-_]/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  // Handle Autocomplete Search Query
  if (query) {
    // 1. Search registered DB organizations
    const { data: dbOrgs } = await supabase
      .from('organizations')
      .select('id, name, corporate_domain')
      .ilike('name', `%${query}%`)
      .limit(5);

    const results: Array<{ id?: string; name: string; domain?: string; logo?: string; isRegistered: boolean }> = [];

    if (dbOrgs && dbOrgs.length > 0) {
      dbOrgs.forEach(org => {
        results.push({
          id: org.id,
          name: org.name,
          domain: org.corporate_domain || undefined,
          logo: org.corporate_domain ? `https://logo.clearbit.com/${org.corporate_domain}` : undefined,
          isRegistered: true
        });
      });
    }

    // 2. Clearbit Autocomplete API fallback (background web search without storing)
    try {
      const clearbitRes = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`);
      if (clearbitRes.ok) {
        const suggestions = await clearbitRes.json();
        if (Array.isArray(suggestions)) {
          suggestions.forEach((item: { name: string; domain: string; logo: string }) => {
            const alreadyIn = results.some(r => r.name.toLowerCase() === item.name.toLowerCase());
            if (!alreadyIn && results.length < 8) {
              results.push({
                name: item.name,
                domain: item.domain,
                logo: item.logo,
                isRegistered: false
              });
            }
          });
        }
      }
    } catch {
      // Ignore network errors for external clearbit fallback
    }

    return NextResponse.json({ suggestions: results });
  }

  // Handle User Email Domain Auto-Detection
  const emailDomain = user.email.split('@')[1]?.toLowerCase();
  const isPublic = !emailDomain || PUBLIC_DOMAINS.has(emailDomain);

  if (isPublic) {
    return NextResponse.json({
      isPublicEmail: true,
      detectedDomain: null,
      existingOrg: null,
      suggestedName: null
    });
  }

  // Check if corporate domain is already registered in DB
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id, name, corporate_domain')
    .eq('corporate_domain', emailDomain)
    .maybeSingle();

  if (existingOrg) {
    return NextResponse.json({
      isPublicEmail: false,
      detectedDomain: emailDomain,
      existingOrg: {
        id: existingOrg.id,
        name: existingOrg.name,
        domain: existingOrg.corporate_domain,
        logo: `https://logo.clearbit.com/${emailDomain}`
      },
      suggestedName: existingOrg.name
    });
  }

  const derivedName = formatDomainToName(emailDomain);

  return NextResponse.json({
    isPublicEmail: false,
    detectedDomain: emailDomain,
    existingOrg: null,
    suggestedName: derivedName,
    logo: `https://logo.clearbit.com/${emailDomain}`
  });
}
