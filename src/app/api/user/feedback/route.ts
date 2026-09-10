import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { FeedbackSubmitSchema, validateBody } from '@/lib/validations';
import { sendFeedbackEmail } from '@/services/email/resend';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const validation = validateBody(FeedbackSubmitSchema, json);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { type, area, subject, message, systemContext } = validation.data;
    let ticketId = crypto.randomUUID();

    const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'EYES User';
    const userEmail = user.email || 'unknown@user.com';

    // Insert into user_feedback table
    try {
      const { data: inserted, error: insertError } = await supabase
        .from('user_feedback')
        .insert({
          id: ticketId,
          user_id: user.id,
          user_email: userEmail,
          user_name: userName,
          type,
          area,
          subject,
          message,
          system_context: systemContext || {},
          status: 'open',
        })
        .select()
        .single();

      if (!insertError && inserted) {
        ticketId = inserted.id;
      } else if (insertError) {
        console.warn('[Feedback API] DB insert warning (table may need migration):', insertError.message);
      }
    } catch (dbErr) {
      console.warn('[Feedback API] DB error:', dbErr);
    }

    // Dispatch direct notification to engineering
    await sendFeedbackEmail({
      ticketId,
      userName,
      userEmail,
      type,
      area,
      subject,
      message,
      systemContext,
    });

    return NextResponse.json({
      success: true,
      ticket: {
        id: ticketId,
        type,
        area,
        subject,
        message,
        status: 'open',
        created_at: new Date().toISOString(),
      },
      message: 'Feedback received successfully. A copy has been dispatched to our engineering team.',
    });
  } catch (err: unknown) {
    console.error('[Feedback API] Error:', err);
    return NextResponse.json({ error: 'Failed to process feedback' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('user_feedback')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Feedback API] Error fetching user feedback:', error.message);
      return NextResponse.json({ tickets: [] });
    }

    return NextResponse.json({ tickets: data || [] });
  } catch (err: unknown) {
    console.error('[Feedback API] GET Error:', err);
    return NextResponse.json({ tickets: [] });
  }
}
