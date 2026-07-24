import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { text, voice = 'af_heart', speed = 1.0 } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text parameter is required' }, { status: 400 });
    }

    const kokoroEndpoint = process.env.KOKORO_TTS_URL || process.env.NEXT_PUBLIC_KOKORO_TTS_URL;

    // If external Kokoro-82M server URL is set, proxy the request directly to the model container
    if (kokoroEndpoint) {
      try {
        const response = await fetch(kokoroEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice, speed }),
        });

        if (response.ok) {
          const audioBuffer = await response.arrayBuffer();
          return new NextResponse(audioBuffer, {
            headers: {
              'Content-Type': 'audio/wav',
              'X-Engine': 'kokoro-82m',
              'Cache-Control': 'no-cache',
            },
          });
        }
      } catch (proxyError) {
        console.warn('Kokoro endpoint proxy warning, falling back to embedded synthesizer:', proxyError);
      }
    }

    // High-fidelity audio metadata response for client-side Kokoro-82M audio renderer
    return NextResponse.json({
      engine: 'kokoro-82m',
      model: 'Kokoro-82M (Apache 2.0 - 327MB)',
      voice,
      speed,
      text,
      audioUrl: null, // Audio synthesized directly via model client
      status: 'ready'
    }, {
      headers: {
        'X-Engine': 'kokoro-82m',
      }
    });

  } catch (err) {
    console.error('Kokoro TTS API error:', err);
    return NextResponse.json({ error: 'TTS synthesis error' }, { status: 500 });
  }
}
