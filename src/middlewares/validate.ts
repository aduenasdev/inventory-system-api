import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

// Avoid a hard dependency on zod types so this middleware can compile
// even if zod isn't installed. Accept any object with a `parse` method
// (zod-compatible) instead of importing AnyZodObject.
type ZodLike = { parse: (input: any) => any };

export const validate =
  (schema: ZodLike) =>
  (req: Request, res: Response, next: NextFunction) => {
    const log = (req as any).logger || logger;
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      log.info({ path: req.path, method: req.method }, "Validación exitosa");
      next();
    } catch (e: any) {
      if (e && Array.isArray(e.errors)) {
        const errors = e.errors.map((error: any) => ({
          path: Array.isArray(error.path) ? error.path.join(".") : String(error.path),
          message: error.message || String(error),
        }));
        log.warn({ path: req.path, method: req.method, errors }, "Error de validación");
        return res.status(400).json({ errors });
      }
      log.warn({ path: req.path, method: req.method, error: e }, "Error de validación desconocido");
      return res.status(400).json({ errors: [{ message: e?.message || String(e) }] });
    }
  };


