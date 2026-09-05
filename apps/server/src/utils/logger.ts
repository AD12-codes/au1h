import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Anything that looks like a credential is redacted wherever it appears in a
 * log object. Wildcards cover nested objects (e.g. a serialised account row).
 */
const REDACT_FIELDS = [
  "accessToken",
  "refreshToken",
  "idToken",
  "password",
  "token",
  "secret",
  "secretHash",
  "authorization",
  "cookie",
  "set-cookie",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: {
    paths: REDACT_FIELDS.flatMap((f) => [
      f,
      `*.${f}`,
      `*.*.${f}`,
      `headers["${f}"]`,
    ]),
    censor: "[redacted]",
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        },
      }),
});
