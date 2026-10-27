import type { EmailMessage } from "./types";

/** What the templates know about the application the mail is sent for. */
export interface AppBranding {
  name: string;
  logo?: string | null;
  /** Comes from the application's allowed origins; used for the footer only. */
  origin?: string | null;
}

export type EmailKind =
  | { kind: "verify-email"; url: string }
  | { kind: "reset-password"; url: string }
  | { kind: "magic-link"; url: string }
  | {
      kind: "otp";
      code: string;
      purpose: "sign-in" | "email-verification" | "forget-password";
    };

const OTP_PURPOSE = {
  "sign-in": "sign in",
  "email-verification": "verify your email",
  "forget-password": "reset your password",
} as const;

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ] ?? ch
  );
}

function layout(app: AppBranding, title: string, bodyHtml: string): string {
  const name = escapeHtml(app.name);
  const logo = app.logo
    ? `<img src="${escapeHtml(app.logo)}" alt="" width="32" height="32" style="border-radius:6px;vertical-align:middle;margin-right:10px">`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f1420">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e3e7ee;border-radius:8px">
<tr><td style="padding:24px 28px 0;font-size:15px;font-weight:600">${logo}${name}</td></tr>
<tr><td style="padding:16px 28px 0;font-size:20px;font-weight:600">${escapeHtml(title)}</td></tr>
<tr><td style="padding:12px 28px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
</table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#5b6478">Sent by ${name}${app.origin ? ` (${escapeHtml(app.origin)})` : ""}. If you didn't request this, you can ignore it.</p>
</td></tr></table></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#2f80ff;color:#fff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:6px">${escapeHtml(label)}</a></p><p style="font-size:13px;color:#5b6478;word-break:break-all">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`;
}

export function render(
  app: AppBranding,
  to: string,
  email: EmailKind
): EmailMessage {
  const from = `${app.name} <${process.env.EMAIL_FROM_ADDRESS ?? "no-reply@localhost"}>`;
  switch (email.kind) {
    case "verify-email":
      return {
        to,
        from,
        subject: `Verify your email for ${app.name}`,
        text: `Confirm your email address for ${app.name} by opening this link:\n\n${email.url}\n\nIf you didn't create an account, ignore this message.`,
        html: layout(
          app,
          "Verify your email",
          `<p>Confirm your email address to finish setting up your ${escapeHtml(app.name)} account.</p>${button(email.url, "Verify email")}`
        ),
      };
    case "reset-password":
      return {
        to,
        from,
        subject: `Reset your ${app.name} password`,
        text: `Someone asked to reset the password for your ${app.name} account. Open this link to choose a new one:\n\n${email.url}\n\nIf it wasn't you, ignore this message; your password is unchanged.`,
        html: layout(
          app,
          "Reset your password",
          `<p>Someone asked to reset the password for your ${escapeHtml(app.name)} account. The link works once.</p>${button(email.url, "Choose a new password")}`
        ),
      };
    case "magic-link":
      return {
        to,
        from,
        subject: `Sign in to ${app.name}`,
        text: `Open this link to sign in to ${app.name}:\n\n${email.url}\n\nThe link works once and expires shortly.`,
        html: layout(
          app,
          "Your sign-in link",
          `<p>Open the link below to sign in to ${escapeHtml(app.name)}. It works once and expires shortly.</p>${button(email.url, "Sign in")}`
        ),
      };
    case "otp": {
      const what = OTP_PURPOSE[email.purpose];
      return {
        to,
        from,
        subject: `${email.code} is your ${app.name} code`,
        text: `Use this code to ${what} on ${app.name}:\n\n${email.code}\n\nIt expires shortly. Never share it.`,
        html: layout(
          app,
          "Your one-time code",
          `<p>Use this code to ${what} on ${escapeHtml(app.name)}:</p><p style="font-family:ui-monospace,Menlo,monospace;font-size:28px;letter-spacing:6px;font-weight:600;margin:16px 0">${escapeHtml(email.code)}</p><p style="font-size:13px;color:#5b6478">It expires shortly. Never share it.</p>`
        ),
      };
    }
    default:
      throw new Error("unknown email kind");
  }
}
