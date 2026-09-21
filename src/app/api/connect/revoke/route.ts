import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform');

  if (!platform) {
    return NextResponse.json({ error: 'Platform is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('oauth_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('platform', platform);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
