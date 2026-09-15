import { NextResponse } from 'next/server';
import { getBaseUrl } from '@/utils/url';

export async function GET(request: Request) {
  const baseUrl = await getBaseUrl(request);
  return NextResponse.redirect(new URL('/api/connect/facebook/start?platform=whatsapp', baseUrl));
}
