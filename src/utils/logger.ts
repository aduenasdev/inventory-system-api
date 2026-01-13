import pino from "pino";
import path from "path";

const isProd = process.env.NODE_ENV === "production";
const logDir = process.env.LOG_DIR || path.join(process.cwd(), "logs");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(isProd
    ? {
        transport: undefined,
        // File logging with daily rotation using pino/file and pino-logrotate
        hooks: {
          logMethod(args, method) {
            // No-op, handled by destination below
            return method.apply(this, args);
          },
        },
      }
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
},
  isProd
    ? pino.destination({
        dest: path.join(logDir, `app-${new Date().toISOString().slice(0, 10)}.log`),
        mkdir: true,
        sync: false,
      })
    : undefined
);

export default logger;
