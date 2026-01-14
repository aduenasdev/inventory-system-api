import rateLimit from "express-rate-limit";
import { Request, Response } from "express";

/**
 * Rate limiter para endpoints de autenticación
 * Previene ataques de fuerza bruta en login/register
 */
export const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 5, // 5 intentos por ventana
  message: {
    message: "Demasiados intentos de autenticación. Intente de nuevo en 1 minuto.",
  },
  standardHeaders: true, // Retorna info de rate limit en headers `RateLimit-*`
  legacyHeaders: false, // Deshabilita headers `X-RateLimit-*`
  handler: (req: Request, res: Response) => {
    const log = req.logger || require("../utils/logger").default;
    log.warn(
      {
        ip: req.ip,
        path: req.path,
        method: req.method,
      },
      "Rate limit excedido en autenticación"
    );
    res.status(429).json({
      message: "Demasiados intentos de autenticación. Intente de nuevo en 1 minuto.",
    });
  },
});

/**
 * Rate limiter general para la API
 * Protege contra abuso general
 */
export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 100, // 100 requests por ventana
  message: {
    message: "Demasiadas peticiones. Intente de nuevo más tarde.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // No aplicar rate limit a health checks
    return req.path === "/health";
  },
  handler: (req: Request, res: Response) => {
    const log = req.logger || require("../utils/logger").default;
    log.warn(
      {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userId: res.locals.user?.id,
      },
      "Rate limit excedido en API general"
    );
    res.status(429).json({
      message: "Demasiadas peticiones. Intente de nuevo más tarde.",
    });
  },
});
