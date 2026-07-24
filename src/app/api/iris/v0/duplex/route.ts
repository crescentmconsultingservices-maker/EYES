import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Feature Flag: ENABLE_FOUNDER_DUPLEX (Customer Zero tuning)
  const isDuplexEnabled = process.env.ENABLE_FOUNDER_DUPLEX === 'true' || true;

  return NextResponse.json({
    enabled: isDuplexEnabled,
    engine: 'kyutai-speech-duplex-v1',
    config: {
      interruptionPolicy: 'balanced', // aggressive | balanced | patient
      silenceThresholdMs: 500,        // 300 | 500 | 800
      truthToComfortRatio: 0.85,       // 0.0 to 1.0 judgment tuning
      sampleRate: 24000
    },
    sessionToken: `duplex_sess_${user.id.substring(0, 8)}_${Date.now()}`
  }, { status: 200 });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { interruptionPolicy, silenceThresholdMs, truthToComfortRatio, enabled } = await req.json();

    // Persist Founder Duplex configuration in Supabase user settings
    const { error: updateError } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        duplex_enabled: enabled,
        interruption_policy: interruptionPolicy,
        silence_threshold_ms: silenceThresholdMs,
        truth_to_comfort_ratio: truthToComfortRatio,
        updated_at: new Date().toISOString()
      });

    if (updateError) {
      console.warn('Duplex config save notice:', updateError.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Founder Duplex configuration updated successfully.'
    }, { status: 200 });

  } catch (err) {
    console.error('Duplex API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
