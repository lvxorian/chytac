import { NextRequest, NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';
import { checkDomain } from '@/lib/rdap';
import { sendAlertEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initDB();
  } catch (err) {
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  const domains = await sql`
    SELECT id, domain_name FROM domains
    WHERE status = 'monitoring'
    LIMIT 100
  `;

  const results: Record<string, unknown>[] = [];
  let emailsSent = 0;

  for (const domain of domains) {
    try {
      const result = await checkDomain(domain.domain_name);

      await sql`
        INSERT INTO check_logs (domain_id, status_code, rdap_status, is_free, error_message)
        VALUES (
          ${domain.id},
          ${result.statusCode},
          ${result.rdapStatuses.length > 0 ? JSON.stringify(result.rdapStatuses) : null},
          ${result.isFree},
          ${result.error || null}
        )
      `;

      if (result.isFree) {
        const now = new Date();

        await sql`
          UPDATE domains
          SET status = 'caught',
              first_seen_free_at = COALESCE(first_seen_free_at, ${now}),
              last_checked_at = ${now},
              updated_at = ${now}
          WHERE id = ${domain.id}
        `;

        try {
          await sendAlertEmail({ domain: domain.domain_name, detectedAt: now });
          emailsSent++;
        } catch (emailError) {
          console.error(`Email failed for ${domain.domain_name}:`, emailError);
        }
      } else {
        await sql`
          UPDATE domains
          SET last_checked_at = NOW(), updated_at = NOW()
          WHERE id = ${domain.id}
        `;
      }

      results.push({
        id: domain.id,
        domain: domain.domain_name,
        isFree: result.isFree,
        statusCode: result.statusCode,
        pendingDelete: result.isPendingDelete,
        redemption: result.isRedemptionPeriod,
        error: result.error,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Check error for ${domain.domain_name}:`, message);

      await sql`
        UPDATE domains
        SET status = 'error', last_checked_at = NOW(), updated_at = NOW()
        WHERE id = ${domain.id}
      `;

      results.push({
        id: domain.id,
        domain: domain.domain_name,
        error: message,
      });
    }
  }

  return NextResponse.json({
    checked: domains.length,
    free: results.filter((r) => r.isFree).length,
    emailsSent,
    results,
    timestamp: new Date().toISOString(),
  });
}
