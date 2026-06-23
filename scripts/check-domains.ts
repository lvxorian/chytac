import { sql, initDB } from '../lib/db';
import { checkDomain } from '../lib/rdap';
import { sendAlertEmail } from '../lib/email';

const ENABLE_EMAIL = Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO);
const NOTIFIED_RECHECK_INTERVAL_MINUTES = 5;

async function main() {
  const start = new Date();
  console.log(`[${start.toISOString()}] Checking domains...`);

  await initDB();

  // --- Phase 1: Check monitoring domains ---
  const monitoringDomains = await sql`
    SELECT id, domain_name FROM domains
    WHERE status = 'monitoring'
    LIMIT 100
  `;

  console.log(`Monitoring: ${monitoringDomains.length} domains`);

  let freeCount = 0;
  let emailsSent = 0;
  let errorCount = 0;
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
            console.log(`FREE: ${domain.domain_name} — email sent`);
          } catch (emailError) {
            console.error(`Email failed for ${domain.domain_name}:`, emailError);
          }
        } else {
          console.log(`FREE: ${domain.domain_name} — email skipped (no RESEND_API_KEY)`);
        }
      } else if (result.isTransitional) {
        console.log(
          `${domain.domain_name}: HTTP ${result.statusCode} (transitional — keep polling)`
        );
        await sql`
          UPDATE domains SET last_checked_at = NOW(), updated_at = NOW()
          WHERE id = ${domain.id}
        `;
      } else if (result.isPendingDelete || result.isRedemptionPeriod) {
        const state = result.isPendingDelete ? 'pendingDelete' : 'redemption';
        console.log(`${domain.domain_name}: HTTP ${result.statusCode} (${state} — keep polling)`);
        await sql`
          UPDATE domains SET last_checked_at = NOW(), updated_at = NOW()
          WHERE id = ${domain.id}
        `;
      } else {
        console.log(`${domain.domain_name}: HTTP ${result.statusCode} (registered)`);
        await sql`
          UPDATE domains SET last_checked_at = NOW(), updated_at = NOW()
          WHERE id = ${domain.id}
        `;
      }

      if (result.error) {
        console.warn(`  WARN: ${result.error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      errorCount++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`ERROR: ${domain.domain_name} — ${message}`);

      try {
        await sql`
          UPDATE domains
          SET status = 'error', last_checked_at = NOW(), updated_at = NOW()
          WHERE id = ${domain.id}
        `;
      } catch {}
    }
  }

  // --- Phase 2: Re-check notified domains (availability tracking) ---
  const notifiedDomains = await sql.unsafe(`
    SELECT id, domain_name FROM domains
    WHERE status = 'notified'
    AND (
      last_checked_at IS NULL
      OR last_checked_at < NOW() - INTERVAL '${NOTIFIED_RECHECK_INTERVAL_MINUTES} minutes'
    )
    LIMIT 100
  `);

  if (notifiedDomains.length > 0) {
    console.log(`Re-checking notified: ${notifiedDomains.length} domains`);

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

        if (result.isFree) {
          console.log(`  ${domain.domain_name}: still available`);
          await sql`
            UPDATE domains SET availability = 'available',
            last_checked_at = NOW(), updated_at = NOW()
            WHERE id = ${domain.id}
          `;
        } else {
          console.log(`  ${domain.domain_name}: now registered`);
          await sql`
            UPDATE domains SET availability = 'registered',
            last_checked_at = NOW(), updated_at = NOW()
            WHERE id = ${domain.id}
          `;
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`  ERROR re-checking ${domain.domain_name}: ${message}`);
        await sql`
          UPDATE domains SET last_checked_at = NOW(), updated_at = NOW()
          WHERE id = ${domain.id}
        `;
      }
    }
  }

  const duration = Date.now() - start.getTime();
  console.log(
    `[${new Date().toISOString()}] Done in ${duration}ms. Checked: ${totalChecked}, New free: ${freeCount}, Emails: ${emailsSent}, Errors: ${errorCount}`
  );

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
