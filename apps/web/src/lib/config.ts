/**
 * Runtime configuration for the admin portal.
 *
 * The Docker image serves `/config.js`, written at container start from the
 * `AU1H_SERVER_URL` environment variable, so one published image works for
 * any deployment. In development (and when `/config.js` is empty) the Vite
 * variables from `.env` apply.
 */
declare global {
  interface Window {
    __AU1H_CONFIG__?: {
      serverUrl?: string;
      adminAppSlug?: string;
      docsUrl?: string;
    };
  }
}

const runtime =
  typeof window === "undefined" ? undefined : window.__AU1H_CONFIG__;

export const SERVER_URL: string =
  runtime?.serverUrl || (import.meta.env.VITE_SERVER_URL as string) || "";

export const ADMIN_APP_SLUG: string =
  runtime?.adminAppSlug ||
  (import.meta.env.VITE_AU1H_ADMIN_APP_SLUG as string | undefined) ||
  "au1h-admin";

/** Where the portal's "Docs" links go; operators hosting their own docs image can override it. */
export const DOCS_URL: string =
  runtime?.docsUrl ||
  (import.meta.env.VITE_DOCS_URL as string | undefined) ||
  "https://au1h.dev/docs";
