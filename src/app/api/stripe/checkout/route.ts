import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Stripe payments have been permanently disabled. All features and audits are complimentary.',
    url: null,
  }, { status: 200 });
}
