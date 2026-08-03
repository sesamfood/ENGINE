type AuthEmailOptions = {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionUrl: string;
  notice: string;
  detail?: { label: string; value: string };
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

function createAuthEmail(options: AuthEmailOptions) {
  const eyebrow = escapeHtml(options.eyebrow);
  const title = escapeHtml(options.title);
  const description = escapeHtml(options.description);
  const actionLabel = escapeHtml(options.actionLabel);
  const actionUrl = escapeHtml(options.actionUrl);
  const notice = escapeHtml(options.notice);
  const detail = options.detail
    ? `<tr>
        <td style="padding:0 40px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5;border-radius:10px;">
            <tr>
              <td style="padding:16px 18px;">
                <p style="margin:0 0 5px;color:#71717a;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(options.detail.label)}</p>
                <p style="margin:0;color:#18181b;font-family:Arial,sans-serif;font-size:14px;line-height:20px;word-break:break-all;">${escapeHtml(options.detail.value)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  return `<!doctype html>
<html lang="da">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;color:#18181b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${description}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f4f5;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="height:5px;background:#18181b;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:38px 40px 16px;">
                <p style="margin:0 0 14px;color:#71717a;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${eyebrow}</p>
                <h1 style="margin:0;color:#18181b;font-family:Arial,sans-serif;font-size:28px;font-weight:700;line-height:35px;letter-spacing:-.02em;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 26px;">
                <p style="margin:0;color:#52525b;font-family:Arial,sans-serif;font-size:16px;line-height:25px;">${description}</p>
              </td>
            </tr>
            ${detail}
            <tr>
              <td style="padding:0 40px 28px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="border-radius:8px;background:#18181b;">
                      <a href="${actionUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;text-decoration:none;">${actionLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 38px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #e4e4e7;">
                  <tr>
                    <td style="padding-top:22px;">
                      <p style="margin:0 0 14px;color:#71717a;font-family:Arial,sans-serif;font-size:13px;line-height:20px;">${notice}</p>
                      <p style="margin:0;color:#a1a1aa;font-family:Arial,sans-serif;font-size:11px;line-height:17px;word-break:break-all;">Virker knappen ikke? Kopiér dette link:<br><a href="${actionUrl}" style="color:#71717a;text-decoration:underline;">${actionUrl}</a></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#a1a1aa;font-family:Arial,sans-serif;font-size:11px;line-height:17px;">Denne e-mail er sendt automatisk. Du kan ikke besvare den.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function createPasswordResetEmail(url: string) {
  const description =
    "Vi har modtaget en anmodning om at nulstille adgangskoden til din konto.";
  const notice =
    "Linket udløber om en time. Hvis du ikke har bedt om en ny adgangskode, kan du trygt ignorere denne e-mail.";

  return {
    subject: "Nulstil din adgangskode",
    html: createAuthEmail({
      eyebrow: "Kontosikkerhed",
      title: "Vælg en ny adgangskode",
      description,
      actionLabel: "Nulstil adgangskode",
      actionUrl: url,
      notice,
    }),
    text: `${description}\n\nNulstil adgangskode: ${url}\n\n${notice}`,
  };
}

export function createVerificationEmail(url: string) {
  const description =
    "Bekræft din e-mailadresse for at aktivere din konto og komme i gang.";
  const notice =
    "Linket udløber om en time. Hvis du ikke har oprettet en konto, kan du trygt ignorere denne e-mail.";

  return {
    subject: "Bekræft din e-mail",
    html: createAuthEmail({
      eyebrow: "Bekræftelse",
      title: "Bekræft din e-mail",
      description,
      actionLabel: "Bekræft e-mail",
      actionUrl: url,
      notice,
    }),
    text: `${description}\n\nBekræft e-mail: ${url}\n\n${notice}`,
  };
}

export function createInvitationEmail(
  inviterName: string,
  organizationName: string,
  invitationId: string,
  url: string,
) {
  const description = `${inviterName} har inviteret dig til at blive en del af ${organizationName}.`;
  const notice =
    "Invitationen udløber om syv dage. Hvis du ikke forventede invitationen, kan du ignorere denne e-mail.";

  return {
    subject: `Invitation til ${organizationName}`,
    html: createAuthEmail({
      eyebrow: "Invitation",
      title: "Du er inviteret",
      description,
      actionLabel: "Accepter invitation",
      actionUrl: url,
      notice,
      detail: { label: "Invitationskode", value: invitationId },
    }),
    text: `${description}\n\nInvitationskode: ${invitationId}\n\nAccepter invitation: ${url}\n\n${notice}`,
  };
}
