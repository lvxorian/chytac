import { NextRequest, NextResponse } from 'next/server';
import { createToken, setAuthCookie, validatePassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!validatePassword(password)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    const token = await createToken();
    setAuthCookie(token);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}
