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

  const formattedDate = detectedAt.toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
  });

  const registrationLink = `https://www.nic.cz/whois/domain/${domain}/`;

  const { data, error } = await resend.emails.send({
    from: 'Chytac <alerts@chytac.app>',
    to: [alertTo],
    subject: `DOMAIN FREE: ${domain}`,
    html: `
      <h2>${domain} is now available!</h2>
      <p>Detected free at: <strong>${formattedDate} (CET/CEST)</strong></p>
      <p><a href="${registrationLink}">Register now at NIC.cz</a></p>
      <hr />
      <p><small>Sent by Chytac drop-catching monitor</small></p>
    `,
    text: `${domain} is available!\n\nDetected at: ${formattedDate}\n\nRegister: ${registrationLink}`,
  });

  if (error) {
    console.error('Resend email error:', error);
    throw new Error(`Email failed: ${error.message}`);
  }

  return data;
}
