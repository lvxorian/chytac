import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasResendKey: typeof process.env.RESEND_API_KEY === 'string' && process.env.RESEND_API_KEY.length > 3,
    hasAlertTo: typeof process.env.ALERT_EMAIL_TO === 'string' && process.env.ALERT_EMAIL_TO.includes('@'),
    keyPrefix: typeof process.env.RESEND_API_KEY === 'string' ? process.env.RESEND_API_KEY.slice(0, 6) + '...' : 'MISSING',
  });
}
