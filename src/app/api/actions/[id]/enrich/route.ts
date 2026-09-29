import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';

export const dynamic = 'force-dynamic';

/**
 * POST /api/actions/[id]/enrich
 *
 * Lazy generation of draft reply and vector citation chain.
 * Called only when the user expands an action card in the UI.
 * Caches the result on the action_queue row for instant subsequent views.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const actionId = resolvedParams?.id;
    if (!actionId) {
      return NextResponse.json({ error: 'Action ID is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch action with user ownership check
    const { data: action, error: fetchError } = await supabase
      .from('action_queue')
      .select('*')
      .eq('id', actionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    // 2. Return instantly if already enriched
    if (action.enriched_at && action.suggested_action) {
      return NextResponse.json({ success: true, action, cached: true });
    }

    // 3. Draft generation for replies
    if (
      (action.action_type === 'EMAIL_REPLY' || action.action_type === 'SLACK_REPLY') &&
      (!action.suggested_action || action.suggested_action.trim().length === 0)
    ) {
      let sentSample = '';
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('email, display_name')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile?.email || profile?.display_name) {
          const emailFilter = profile.email || 'xxxxxxxx';
          const nameFilter = profile.display_name || 'xxxxxxxx';
          const { data: sentMemories } = await supabase
            .from('memories')
            .select('content')
            .eq('user_id', user.id)
            .eq('platform', 'gmail')
            .or(`author.ilike.%${emailFilter}%,author.ilike.%${nameFilter}%`)
            .limit(5);

          if (sentMemories && sentMemories.length > 0) {
            sentSample = sentMemories.map(m => m.content.slice(0, 500)).join('\n\n---\n\n');
          }
        }
      } catch (err) {
        console.warn('[ActionEnrich] Could not fetch sent sample:', err);
      }

      const voicePrompt = `You are EYES. A high-confidence commitment or ask has been detected in the user's incoming mail.
Draft a reply the user could send, in their own voice as inferred from their past sent messages.
The draft is a STARTING POINT for the user to edit and approve — it is never sent automatically. Keep it concise, match the register of the original thread, and never invent facts the user has not expressed. Output only the draft body.

Original Message Context:
Title: ${action.title}
Context: ${action.description || ''}

User's Past Sent Messages (for tone and voice style):
${sentSample || 'No prior samples available. Keep it direct and professional.'}

Draft Reply:`;

      try {
        const draftResult = await invokeModel({
          capability: 'chat',
          preference: 'gemini',
          capture: false,
          messages: [{ role: 'user', content: voicePrompt }]
        });

        if (typeof draftResult === 'string' && draftResult.trim().length > 0) {
          action.suggested_action = draftResult.trim();
        }
      } catch (err) {
        console.warn(`[ActionEnrich] Draft generation failed for action ${action.id}:`, err);
      }
    }

    // 4. Vector citation chain
    try {
      const embedInput = `${action.title} ${action.description || ''}`;
      const embedRes = await invokeModel({ capability: 'embed', messages: [{ role: 'user', content: embedInput }] });

      if (embedRes && typeof embedRes !== 'string' && 'embedding' in embedRes) {
        const { data: matches } = await supabase.rpc('match_memories', {
          query_embedding: embedRes.embedding,
          match_threshold: 0.25,
          match_count: 3,
          user_id_arg: user.id
        });

        if (matches && matches.length > 0) {
          const historyContext = matches.map((m: { platform: string; title?: string; content?: string }) => `[${m.platform}] ${m.title || 'Event'}: ${m.content}`).join('\n');
          const synthesisPrompt = `You are building a citation chain for a task. 
Task: ${action.title} - ${action.description || ''}
User's History:
${historyContext}

Write a 1-2 sentence description explaining the task AND citing the past commitment if it exists (e.g. "Valentin is asking about the deck. You promised it on April 17."). If the history is completely irrelevant, just return the original task description.
DO NOT use markdown or quotation marks.`;

          const synthesis = await invokeModel({
            capability: 'chat',
            preference: 'gemini',
            capture: false,
            messages: [{ role: 'user', content: synthesisPrompt }]
          });

          if (typeof synthesis === 'string' && synthesis.trim().length > 10) {
            action.description = synthesis.trim();
          }
        }
      }
    } catch (err) {
      console.warn(`[ActionEnrich] Citation chain failed for action ${action.id}:`, err);
    }

    // 5. Cache enriched fields in DB
    const enrichedAt = new Date().toISOString();
    action.enriched_at = enrichedAt;

    await supabase
      .from('action_queue')
      .update({
        suggested_action: action.suggested_action,
        description: action.description,
        enriched_at: enrichedAt,
      })
      .eq('id', action.id)
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, action, cached: false });

  } catch (error) {
    console.error('[ActionEnrich] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to enrich action' }, { status: 500 });
  }
}
