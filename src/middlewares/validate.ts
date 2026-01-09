import { Request, Response, NextFunction } from "express";

// Avoid a hard dependency on zod types so this middleware can compile
// even if zod isn't installed. Accept any object with a `parse` method
// (zod-compatible) instead of importing AnyZodObject.
type ZodLike = { parse: (input: any) => any };

export const validate =
  (schema: ZodLike) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (e: any) {
      if (e && Array.isArray(e.errors)) {
        const errors = e.errors.map((error: any) => ({
          path: Array.isArray(error.path) ? error.path.join(".") : String(error.path),
          message: error.message || String(error),
        }));
        return res.status(400).json({ errors });
      }
      return res.status(400).json({ errors: [{ message: e?.message || String(e) }] });
    }
  };
