import { NextRequest, NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';

export async function GET() {
  await initDB();

  const domains = await sql`
    SELECT 
      d.*,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'id', cl.id,
            'status_code', cl.status_code,
            'rdap_status', cl.rdap_status,
            'is_free', cl.is_free,
            'error_message', cl.error_message,
            'checked_at', cl.checked_at
          ) ORDER BY cl.checked_at DESC
        )
        FROM check_logs cl
        WHERE cl.domain_id = d.id
        LIMIT 10),
        '[]'::json
      ) as recent_logs
    FROM domains d
    ORDER BY d.created_at DESC
  `;

  return NextResponse.json(domains);
}

export async function POST(request: NextRequest) {
  await initDB();

  let body: { domain?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { domain } = body;

  if (!domain || typeof domain !== 'string') {
    return NextResponse.json({ error: 'Domain name is required' }, { status: 400 });
  }

  let normalized = domain.toLowerCase().trim();
  normalized = normalized.replace(/^https?:\/\//, '');
  normalized = normalized.replace(/\/.*$/, '');
  normalized = normalized.trim();

  if (!normalized.endsWith('.cz')) {
    return NextResponse.json({ error: 'Only .cz domains are supported' }, { status: 400 });
  }

  const existing = await sql`
    SELECT id FROM domains WHERE domain_name = ${normalized}
  `;

  if (existing.length > 0) {
    return NextResponse.json({ error: 'Domain already in watchlist' }, { status: 409 });
  }

  const [newDomain] = await sql`
    INSERT INTO domains (domain_name, status)
    VALUES (${normalized}, 'monitoring')
    RETURNING *
  `;

  return NextResponse.json(newDomain, { status: 201 });
}
