import Imap from 'imap';
import { sql, initDB } from '../lib/db';

const IMAP_HOST = 'imap.seznam.cz';
const IMAP_PORT = 993;
const SUBJECT_KEYWORD = 'skončila bez příhozu';
const DOMAIN_REGEX = /domény (\S+\.cz)/i;

function connectImap(user: string, pass: string): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user,
      password: pass,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      connTimeout: 15000,
      authTimeout: 15000,
    });

    imap.once('ready', () => resolve(imap));
    imap.once('error', (err: Error) => reject(err));
    imap.connect();
  });
}

async function main() {
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!user || !pass) {
    console.error('IMAP_USER or IMAP_PASS not set');
    process.exit(1);
  }

  console.log(`[${new Date().toISOString()}] Connecting to ${IMAP_HOST}...`);

  let imap: Imap | null = null;
  const foundDomains: string[] = [];

  try {
    imap = await connectImap(user, pass);
    console.log('Connected');

    await new Promise<void>((resolve, reject) => {
      imap!.openBox('INBOX', false, (err) => {
        if (err) return reject(err);

        imap!.search(['UNSEEN'], (err2, uids) => {
          if (err2) return reject(err2);

          if (!uids || uids.length === 0) {
            console.log('No unseen messages');
            return resolve();
          }

          console.log(`Found ${uids.length} unseen messages`);
          const fetch = imap!.fetch(uids, {
            bodies: 'HEADER.FIELDS (SUBJECT)',
            struct: true,
          });

          fetch.on('message', (msg) => {
            let subject = '';

            msg.on('body', (stream) => {
              let buffer = '';
              stream.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf-8'); });
              stream.once('end', () => {
                const m = buffer.match(/^Subject: (.+)$/im);
                if (m) subject = m[1].replace(/\r?\n\s*/g, ' ').trim();
              });
            });

            msg.once('end', () => {
              if (!subject) return;

              if (!subject.includes(SUBJECT_KEYWORD)) {
                console.log(`  Skip: "${subject.slice(0, 80)}"`);
                return;
              }

              const match = subject.match(DOMAIN_REGEX);
              if (!match) {
                console.warn(`  Match fail: "${subject}"`);
                return;
              }

              const domain = match[1].toLowerCase();
              console.log(`  Found: ${domain}`);
              foundDomains.push(domain);
            });
          });

          fetch.once('error', reject);
          fetch.once('end', resolve);
        });
      });
    });
  } catch (err) {
    console.error('IMAP error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    if (imap) {
      try { imap.end(); } catch {}
    }
  }

  // Insert found domains into DB
  if (foundDomains.length > 0) {
    await initDB();

    let inserted = 0;
    for (const domain of foundDomains) {
      try {
        const result = await sql`
          INSERT INTO domains (domain_name, status)
          VALUES (${domain}, 'monitoring')
          ON CONFLICT (domain_name) DO NOTHING
          RETURNING id
        `;
        if (result.length > 0) {
          inserted++;
          console.log(`  Added: ${domain}`);
        } else {
          console.log(`  Already in watchlist: ${domain}`);
        }
      } catch (dbErr) {
        console.error(`  DB error for ${domain}:`, dbErr);
      }
    }

    console.log(`Inserted ${inserted} new domains`);
  }

  console.log(`[${new Date().toISOString()}] Done.`);
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
