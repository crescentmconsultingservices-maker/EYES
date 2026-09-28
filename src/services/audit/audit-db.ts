import { createClient } from '@/utils/supabase/server';

export async function updateAuditStage(auditId: string, stage: string, extra?: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase
    .from('reputation_audits')
    .update({ stage, ...(extra ?? {}) })
    .eq('id', auditId);
}

export async function fetchAuditData(auditId: string, userId: string) {
  const supabase = await createClient();
  
  // Get the audit record metadata
  const { data: auditRecord } = await supabase
    .from('reputation_audits')
    .select('metadata')
    .eq('id', auditId)
    .single();

  const auditType = ((auditRecord?.metadata as Record<string, unknown>)?.audit_type as string) || 'full';
  
  // Get User Settings for Risk Sensitivity
  const { data: settingsData } = await supabase
    .from('connector_settings')
    .select('data_types')
    .eq('user_id', userId)
    .eq('platform', 'user_global')
    .maybeSingle();

  let riskSensitivity = 'MEDIUM';
  if (settingsData?.data_types?.[0]) {
    try {
      const parsedSettings = JSON.parse(settingsData.data_types[0]);
      if (parsedSettings.riskSensitivity) riskSensitivity = parsedSettings.riskSensitivity;
    } catch (parseErr) {
      console.warn('[Audit] Failed to parse connector settings JSON:', parseErr);
    }
  }

  // Fetch Memories
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const { data: rawEvents, error: fetchError } = await supabase
    .from('memories')
    .select('id, platform, timestamp, title, content, author')
    .eq('user_id', userId)
    .gte('timestamp', twoYearsAgo.toISOString())
    .limit(5000);

  const events = rawEvents
    ? rawEvents
        .filter(e => e.content !== null)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    : null;

  if (fetchError || !events) {
    throw new Error(`Data retrieval failed: ${fetchError?.message}`);
  }

  return { events, auditRecord, auditType, riskSensitivity };
}

export async function markAuditFailed(auditId: string, errorMessage: string) {
  const supabase = await createClient();
  await supabase.from('reputation_audits').update({
    status: 'failed',
    summary_narrative: `Analysis failed: ${errorMessage}. Please check AI quotas or retry.`
  }).eq('id', auditId);
}
