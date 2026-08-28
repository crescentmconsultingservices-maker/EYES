import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetch privacy exclusions from the database table for a specific connector and exclusion type.
 * GDPR Privacy Shield Integration.
 */
export async function getPrivacyExclusions(
  supabase: SupabaseClient,
  userId: string,
  connectorId: string,
  excludeType: 'email_address' | 'slack_channel' | 'discord_server' | 'github_repo'
): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('privacy_excludes')
      .select('exclude_value')
      .eq('user_id', userId)
      .eq('connector_id', connectorId)
      .eq('exclude_type', excludeType);

    if (error) {
      console.error(`[Privacy Shield] Error loading exclusions for ${connectorId}:`, error.message);
      return new Set();
    }

    return new Set((data ?? []).map((e) => e.exclude_value.toLowerCase()));
  } catch (err) {
    console.error(`[Privacy Shield] Unexpected error loading exclusions for ${connectorId}:`, err);
    return new Set();
  }
}
