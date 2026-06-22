import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'insecure-default-change-in-production'
);
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'chytac';
const COOKIE_NAME = 'chytac_token';
const TOKEN_MAX_AGE = 60 * 60 * 24; // 24 hours

export async function createToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export function getSessionToken(): string | undefined {
  return cookies().get(COOKIE_NAME)?.value;
}

export function setAuthCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_MAX_AGE,
  });
}

export function clearAuthCookie() {
  cookies().delete(COOKIE_NAME);
}

export function validatePassword(password: string): boolean {
  return password === AUTH_PASSWORD;
}

export async function isAuthenticated(): Promise<boolean> {
  const token = getSessionToken();
  if (!token) return false;
  return verifyToken(token);
}
