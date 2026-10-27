import { createTransport, type Transporter } from "nodemailer";
import { logger } from "@/utils/logger";
import type { EmailMessage, EmailProvider } from "./types";

/**
 * Development default: no mail leaves the machine; the message (with its
 * link or code) is written to the log so the flow can be completed by hand.
 */
/**
 * Logs each message instead of sending it. In production the body (which
 * holds links and codes) is withheld, and a warning is logged at startup via
 * `providerFromEnv`, because this is almost certainly a misconfiguration.
 */
export const consoleProvider: EmailProvider = {
  name: "console",
  send(message) {
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        { to: message.to, subject: message.subject },
        "EMAIL not sent: EMAIL_PROVIDER is console (body withheld in production)"
      );
    } else {
      logger.info(
        { to: message.to, subject: message.subject, body: message.text },
        "EMAIL (console provider; set EMAIL_PROVIDER to deliver for real)"
      );
    }
    return Promise.resolve();
  },
};

/** Test double: keeps every message in memory. */
const outbox: EmailMessage[] = [];
export const memoryProvider: EmailProvider = {
  name: "memory",
  send(message) {
    outbox.push(message);
    return Promise.resolve();
  },
};
export function getOutbox(): EmailMessage[] {
  return outbox;
}
export function clearOutbox(): void {
  outbox.length = 0;
}

/** Any SMTP server, via nodemailer. `SMTP_URL=smtp(s)://user:pass@host:port`. */
export function smtpProvider(url: string, from: string): EmailProvider {
  let transport: Transporter | null = null;
  return {
    name: "smtp",
    async send(message) {
      transport ??= createTransport(url);
      await transport.sendMail({
        from: message.from ?? from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

/** Resend's HTTP API; no SDK needed. */
export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    async send(message) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: message.from ?? from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
      }
    },
  };
}

/**
 * Pick the provider from the environment:
 *   EMAIL_PROVIDER     = console (default) | smtp | resend | memory (tests)
 *   EMAIL_FROM_ADDRESS = no-reply@example.com (templates prefix the app name)
 *   SMTP_URL / RESEND_API_KEY
 */
export function providerFromEnv(): EmailProvider {
  const kind = process.env.EMAIL_PROVIDER ?? "console";
  const from = `au1h <${process.env.EMAIL_FROM_ADDRESS ?? "no-reply@localhost"}>`;
  switch (kind) {
    case "smtp": {
      const url = process.env.SMTP_URL;
      if (!url) {
        throw new Error("EMAIL_PROVIDER=smtp requires SMTP_URL");
      }
      return smtpProvider(url, from);
    }
    case "resend": {
      const key = process.env.RESEND_API_KEY;
      if (!key) {
        throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY");
      }
      return resendProvider(key, from);
    }
    case "memory":
      return memoryProvider;
    case "console":
      if (process.env.NODE_ENV === "production") {
        logger.warn(
          "EMAIL_PROVIDER is console in production: verification, reset, magic-link and OTP emails will NOT be delivered"
        );
      }
      return consoleProvider;
    default:
      throw new Error(
        `Unknown EMAIL_PROVIDER "${kind}" (console | smtp | resend | memory)`
      );
  }
}
