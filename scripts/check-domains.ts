import { sql, initDB } from '../lib/db';
import { checkDomain } from '../lib/rdap';
import { sendAlertEmail } from '../lib/email';

const ENABLE_EMAIL = Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO);

async function main() {
  const start = new Date();
  console.log(`[${start.toISOString()}] Checking domains...`);

  await initDB();

  const domains = await sql`
    SELECT id, domain_name FROM domains
    WHERE status = 'monitoring'
    LIMIT 100
  `;

  console.log(`Found ${domains.length} domains to check`);

  let freeCount = 0;
  let emailsSent = 0;
  let errorCount = 0;

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
        freeCount++;
        const now = new Date();

        await sql`
          UPDATE domains
          SET status = 'caught',
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
          console.log(`FREE: ${domain.domain_name} — email skipped (no RESEND_API_KEY set)`);
        }
      } else if (result.isPendingDelete || result.isRedemptionPeriod) {
        const state = result.isPendingDelete ? 'pendingDelete' : 'redemption';
        console.log(`${domain.domain_name}: HTTP ${result.statusCode} (${state} — keep polling)`);
        await sql`
          UPDATE domains
          SET last_checked_at = NOW(), updated_at = NOW()
          WHERE id = ${domain.id}
        `;
      } else {
        console.log(`${domain.domain_name}: HTTP ${result.statusCode} (registered)`);
        await sql`
          UPDATE domains
          SET last_checked_at = NOW(), updated_at = NOW()
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

  const duration = Date.now() - start.getTime();
  console.log(
    `[${new Date().toISOString()}] Done in ${duration}ms. Checked: ${domains.length}, Free: ${freeCount}, Emails: ${emailsSent}, Errors: ${errorCount}`
  );

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
