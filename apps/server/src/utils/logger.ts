import pino from "pino";

// const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: "info",
  serializers: {
    error: pino.stdSerializers.err,
  },
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
    },
  },
});
