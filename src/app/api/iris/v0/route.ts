import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { CognitiveService } from '@/services/cognitive/rag';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await CognitiveService.generateAnswer(query, user.id);
    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error("[IRIS API v0] Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

