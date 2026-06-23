import { NextRequest, NextResponse } from 'next/server';
import { sql, initDB } from '@/lib/db';
import { checkDomain } from '@/lib/rdap';
import { sendAlertEmail } from '@/lib/email';

const ENABLE_EMAIL = Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO);
const NOTIFIED_RECHECK_INTERVAL_MINUTES = 5;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initDB();
  } catch {
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  // --- Phase 1: Check monitoring domains ---
  const monitoringDomains = await sql`
    SELECT id, domain_name FROM domains
    WHERE status = 'monitoring'
    LIMIT 100
  `;

  const results: Record<string, unknown>[] = [];
  let emailsSent = 0;
  let freeCount = 0;
  let totalChecked = 0;

  for (const domain of monitoringDomains) {
    try {
      const result = await checkDomain(domain.domain_name);
      totalChecked++;

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
        freeCount++;
        const now = new Date();

        await sql`
          UPDATE domains
          SET status = 'notified',
              availability = 'available',
              first_seen_free_at = COALESCE(first_seen_free_at, ${now}),
              last_checked_at = ${now},
              updated_at = ${now}
          WHERE id = ${domain.id}
        `;

        if (ENABLE_EMAIL) {
          try {
            await sendAlertEmail({ domain: domain.domain_name, detectedAt: now });
            emailsSent++;
          } catch (emailError) {
            console.error(`Email failed for ${domain.domain_name}:`, emailError);
          }
        }
      } else if (result.isTransitional) {
        await sql`
          UPDATE domains
          SET last_checked_at = NOW(), updated_at = NOW()
          WHERE id = ${domain.id}
        `;
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

      results.push({ id: domain.id, domain: domain.domain_name, error: message });
    }
  }

  // --- Phase 2: Re-check notified domains ---
  const notifiedDomains = await sql.unsafe(`
    SELECT id, domain_name FROM domains
    WHERE status = 'notified'
    AND (
      last_checked_at IS NULL
      OR last_checked_at < NOW() - INTERVAL '${NOTIFIED_RECHECK_INTERVAL_MINUTES} minutes'
    )
    LIMIT 100
  `);

  for (const domain of notifiedDomains) {
    try {
      const result = await checkDomain(domain.domain_name);
      totalChecked++;

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

      const newAvailability = result.isFree ? 'available' : 'registered';

      await sql`
        UPDATE domains SET availability = ${newAvailability},
        last_checked_at = NOW(), updated_at = NOW()
        WHERE id = ${domain.id}
      `;

      results.push({
        id: domain.id,
        domain: domain.domain_name,
        isFree: result.isFree,
        statusCode: result.statusCode,
        recheck: true,
        availability: newAvailability,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await sql`
        UPDATE domains SET last_checked_at = NOW(), updated_at = NOW()
        WHERE id = ${domain.id}
      `;
    }
  }

  return NextResponse.json({
    checked: totalChecked,
    free: freeCount,
    emailsSent,
    results,
    timestamp: new Date().toISOString(),
  });
}
