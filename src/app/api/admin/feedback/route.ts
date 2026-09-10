import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { FeedbackAdminReplySchema, validateBody } from '@/lib/validations';
import { sendTicketReplyEmail } from '@/services/email/resend';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '').toLowerCase();
    const userEmail = (user.email || '').toLowerCase();
    const isAdmin = 
      userEmail.includes('thomasshelby') ||
      userEmail.includes('chandruselvam') || 
      userEmail.includes('crescentm') || 
      adminEmails.includes(userEmail);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const adminClient = await createAdminClient();
    let query = adminClient
      .from('user_feedback')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Admin Feedback] Query error:', error);
      return NextResponse.json({ tickets: [] });
    }

    return NextResponse.json({ tickets: data || [] });
  } catch (err: unknown) {
    console.error('[Admin Feedback] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '').toLowerCase();
    const userEmail = (user.email || '').toLowerCase();
    const isAdmin = 
      userEmail.includes('thomasshelby') ||
      userEmail.includes('chandruselvam') || 
      userEmail.includes('crescentm') || 
      adminEmails.includes(userEmail);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const json = await req.json();
    const validation = validateBody(FeedbackAdminReplySchema, json);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { id, status, adminResponse } = validation.data;
    const dbStatus = status === 'in_progress' ? 'open' : status;

    const adminClient = await createAdminClient();
    const { data: updatedTicket, error: updateError } = await adminClient
      .from('user_feedback')
      .update({
        status: dbStatus,
        admin_response: adminResponse,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError || !updatedTicket) {
      console.error('[Admin Feedback] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
    }

    // Attempt to notify user via email
    const recipientEmail = updatedTicket.user_email;
    const recipientName = updatedTicket.user_name || 'EYES User';

    if (recipientEmail) {
      await sendTicketReplyEmail({
        to: recipientEmail,
        userName: recipientName,
        ticketId: updatedTicket.id,
        subject: updatedTicket.subject,
        status: updatedTicket.status,
        adminResponse,
      });
    }

    return NextResponse.json({ success: true, ticket: updatedTicket });
  } catch (err: unknown) {
    console.error('[Admin Feedback] Reply Error:', err);
    return NextResponse.json({ error: 'Failed to submit response' }, { status: 500 });
  }
}
