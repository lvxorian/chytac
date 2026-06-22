import { NextRequest, NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  await initDB();

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
  }

  const logs = await sql`
    SELECT * FROM check_logs
    WHERE domain_id = ${id}
    ORDER BY checked_at DESC
    LIMIT 50
  `;

  return NextResponse.json(logs);
}
