import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendFeedbackEmail } from '@/services/email/resend';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await req.json().catch(() => ({}));
    const { message, module = 'EYES', systemContext } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Feedback message cannot be empty.' }, { status: 400 });
    }

    const userName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'Anonymous User';
    const userEmail = user?.email || 'user@the-eyes.app';

    console.log(`[API /api/user/feedback] Received feedback from ${userName} (${userEmail}) via ${module}`);

    // 1. Database fallback persistence (if user_feedback table exists, save it)
    try {
      await supabase.from('user_feedback').insert({
        user_id: user?.id || null,
        user_email: userEmail,
        user_name: userName,
        module,
        message: message.trim(),
        system_context: systemContext || null,
        created_at: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('[API /api/user/feedback] Database table insert optional fallback note:', dbErr);
    }

    // 2. Immediate Email Dispatch to Developer Team
    void sendFeedbackEmail({
      userName,
      userEmail,
      module,
      message: message.trim(),
      systemContext,
    });

    const reply = `Thank you ${userName}! Your feedback has been sent directly to our development team. We will review it shortly. 🚀`;

    return NextResponse.json({
      success: true,
      message: 'Feedback received & dispatched to development team.',
      reply,
    });
  } catch (err: any) {
    console.error('[API /api/user/feedback] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to submit feedback.' },
      { status: 500 }
    );
  }
}
