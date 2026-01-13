import { Request, Response, NextFunction } from "express";
import path from "path";
import pino from "pino";

const logDir = process.env.LOG_DIR || path.join(process.cwd(), "logs");

function getUserLogFile(userId?: string | number) {
  const date = new Date().toISOString().slice(0, 10);
  if (userId) {
    return path.join(logDir, `app-${date}-user-${userId}.log`);
  }
  return path.join(logDir, `app-${date}-general.log`);
}

export function loggerPerUserMiddleware(req: Request, res: Response, next: NextFunction) {
  // userId puede estar en req.user.id (ajusta según tu estrategia de auth)
  const userId = req.user?.id;
  const logFile = getUserLogFile(userId);
  req.logger = pino({
    level: process.env.LOG_LEVEL || "info",
  }, pino.destination({ dest: logFile, mkdir: true, sync: false }));
  next();
}

// Para usar en controladores/servicios: req.logger.info({ ... })
