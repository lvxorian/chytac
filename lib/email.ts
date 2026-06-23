import { Resend } from 'resend';

interface AlertEmailParams {
  domain: string;
  detectedAt: Date;
}

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendAlertEmail({ domain, detectedAt }: AlertEmailParams) {
  const resend = getResend();
  const alertTo = process.env.ALERT_EMAIL_TO!;
  const alertFrom = process.env.ALERT_EMAIL_FROM || 'onboarding@resend.dev';

  const formattedDate = detectedAt.toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
  });

  const registrationLink = `https://www.wedos.cz/domeny/${domain}/registrace`;
  const whoisLink = `https://www.nic.cz/whois/domain/${domain}/`;

  const { data, error } = await resend.emails.send({
    from: `Chytac <${alertFrom}>`,
    to: [alertTo],
    subject: `DOMÉNA VOLNÁ: ${domain}`,
    html: `
      <h2>Doména ${domain} je volná!</h2>
      <p>Uvolněna: <strong>${formattedDate} (CET/CEST)</strong></p>
      <p><a href="${registrationLink}">Zaregistrovat u WEDOS.cz</a></p>
      <p style="color:#666;font-size:12px;">
        <a href="${whoisLink}">WHOIS NIC.cz</a>
      </p>
      <hr />
      <p style="color:#999;font-size:11px;">Odesláno systémem Chytac</p>
    `,
    text: `Doména ${domain} je volná!\n\nUvolněna: ${formattedDate}\n\nZaregistrovat u WEDOS: ${registrationLink}\nWHOIS: ${whoisLink}`,
  });

  if (error) {
    console.error('Resend email error:', error);
    throw new Error(`Email failed: ${error.message}`);
  }

  return data;
}
