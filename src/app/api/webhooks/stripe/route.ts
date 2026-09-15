import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    received: true,
    message: 'Stripe payments and webhooks have been permanently disabled.',
  }, { status: 200 });
}
