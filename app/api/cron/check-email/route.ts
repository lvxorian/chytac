import { NextRequest, NextResponse } from 'next/server';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { sql, initDB } from '@/lib/db';

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
      connTimeout: 10000,
      authTimeout: 10000,
    });
    imap.once('ready', () => resolve(imap));
    imap.once('error', (err: Error) => reject(err));
    imap.connect();
  });
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const urlSecret = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');

  const isAuthorized =
    cronSecret &&
    (authHeader === `Bearer ${cronSecret}` || urlSecret === cronSecret);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;

  if (!user || !pass) {
    return NextResponse.json({ error: 'IMAP_USER or IMAP_PASS not set' }, { status: 500 });
  }

  let imap: Imap | null = null;
  const foundDomains: string[] = [];
  const skippedSubjects: string[] = [];
  let totalMessages = 0;
  let error: string | null = null;

  try {
    imap = await connectImap(user, pass);

    await new Promise<void>((resolve, reject) => {
      imap!.openBox('INBOX', true, (err) => {
        if (err) return reject(err);

        imap!.search(['ALL'], (err2, uids) => {
          if (err2) return reject(err2);

          if (!uids || uids.length === 0) {
            totalMessages = 0;
            return resolve();
          }

          totalMessages = uids.length;
          const lastUids = uids.slice(-40);
          let pending = lastUids.length;
          const fetch = imap!.fetch(lastUids, { bodies: ['HEADER'] });

          fetch.on('message', (msg) => {
            let buffer = Buffer.alloc(0);

            msg.on('body', (stream) => {
              stream.on('data', (chunk: Buffer) => {
                buffer = Buffer.concat([buffer, chunk]);
              });
            });

            msg.once('end', () => {
              simpleParser(buffer, (parseErr, parsed) => {
                if (!parseErr && parsed.subject) {
                  const subject = parsed.subject;

                  if (subject.includes(SUBJECT_KEYWORD)) {
                    const match = subject.match(DOMAIN_REGEX);
                    if (match) {
                      foundDomains.push(match[1].toLowerCase());
                    }
                  } else if (subject.includes('aukce')) {
                    skippedSubjects.push(subject.slice(0, 100));
                  }
                }

                pending--;
                if (pending === 0) resolve();
              });
            });
          });

          fetch.once('error', reject);
        });
      });
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    if (imap) {
      try { imap.end(); } catch {}
    }
  }

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  // Insert found domains into DB
  let inserted = 0;
  if (foundDomains.length > 0) {
    await initDB();

    for (const domain of foundDomains) {
      const result = await sql`
        INSERT INTO domains (domain_name, status)
        VALUES (${domain}, 'monitoring')
        ON CONFLICT (domain_name) DO NOTHING
        RETURNING id
      `;
      if (result.length > 0) inserted++;
    }
  }

  return NextResponse.json({
    totalEmails: totalMessages,
    found: foundDomains,
    inserted,
    skipped: skippedSubjects.slice(-5),
    timestamp: new Date().toISOString(),
  });
}
