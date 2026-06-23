import Imap from 'imap';
import { simpleParser } from 'mailparser';
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

    const box = await new Promise<Imap.Box>((resolve, reject) => {
      imap!.openBox('INBOX', false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });

    if (box.messages.total === 0) {
      console.log('No messages in inbox');
    } else {
      const uids = await new Promise<number[]>((resolve, reject) => {
        imap!.search(['ALL'], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      });

      if (uids.length === 0) {
        console.log('No messages');
      } else {
        console.log(`Found ${uids.length} messages total`);

        const messages = await new Promise<
          { uid: number; subject: string }[]
        >((resolve, reject) => {
          const results: { uid: number; subject: string }[] = [];
          let pending = 0;
          const fetch = imap!.fetch(uids, { bodies: '' });

          fetch.on('message', (msg) => {
            pending++;
            let uid = 0;
            let buffer = Buffer.alloc(0);

            msg.on('attributes', (attrs) => {
              uid = attrs.uid;
            });

            msg.on('body', (stream) => {
              stream.on('data', (chunk: Buffer) => {
                buffer = Buffer.concat([buffer, chunk]);
              });
            });

            msg.once('end', () => {
              simpleParser(buffer, (err, parsed) => {
                if (!err && parsed.subject) {
                  results.push({ uid, subject: parsed.subject });
                }
                pending--;
                if (pending === 0) resolve(results);
              });
            });
          });

          fetch.once('error', reject);
          fetch.once('end', () => {
            if (pending === 0) resolve(results);
          });
        });

        for (const { uid, subject } of messages) {
          console.log(`  Subject: "${subject.slice(0, 100)}"`);

          if (!subject.includes(SUBJECT_KEYWORD)) {
            console.log(`    Skip (no keyword)`);
            continue;
          }

          const match = subject.match(DOMAIN_REGEX);
          if (!match) {
            console.warn(`    Match fail`);
            continue;
          }

          const domain = match[1].toLowerCase();
          console.log(`    Found: ${domain}`);
          foundDomains.push(domain);
        }
      }
    }
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
