import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:support@eyes.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
  process.env.VAPID_PRIVATE_KEY as string
);

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: subscriptions, error: dbError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user.id);

    if (dbError || !subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ error: 'No subscriptions found' }, { status: 404 });
    }

    const payload = JSON.stringify({
      title: 'EYES Alert',
      body: 'This is a test notification from EYES via Web Push!',
    });

    const sendPromises = subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };
      return webpush.sendNotification(pushSubscription, payload).catch((err) => {
        console.error('Error pushing to endpoint:', sub.endpoint, err);
        // Could delete invalid subscriptions here (status 410)
      });
    });

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, count: subscriptions.length });
  } catch (err: any) {
    console.error('Test Notification Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
