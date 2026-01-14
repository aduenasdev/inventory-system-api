import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import logger from "../utils/logger";
import { ZodError } from "zod";

/**
 * Middleware global de manejo de errores
 * Debe ser el último middleware registrado en app.ts
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const log = req.logger || logger;

  // Error operacional conocido (AppError)
  if (err instanceof AppError) {
    log.warn(
      {
        error: err.message,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        userId: res.locals.user?.id,
      },
      `Error operacional: ${err.message}`
    );

    return res.status(err.statusCode).json({
      message: err.message,
    });
  }

  // Error de validación de Zod
  if (err instanceof ZodError) {
    const errors = err.issues.map((error: any) => ({
      path: Array.isArray(error.path) ? error.path.join(".") : String(error.path),
      message: error.message || String(error),
    }));

    log.warn(
      {
        errors,
        path: req.path,
        method: req.method,
      },
      "Error de validación Zod"
    );

    return res.status(400).json({ errors });
  }

  // Error inesperado (no operacional)
  log.error(
    {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: res.locals.user?.id,
    },
    "Error inesperado del servidor"
  );

  // En producción, no exponer detalles del error
  const message =
    process.env.NODE_ENV === "production"
      ? "Error interno del servidor"
      : err.message;

  return res.status(500).json({
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}

/**
 * Middleware para capturar errores asíncronos
 * Envuelve funciones async para que sus errores sean capturados por errorHandler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
