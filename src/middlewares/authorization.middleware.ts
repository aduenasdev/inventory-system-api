import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";


export const hasPermission = (permission: string) => (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;
    const log = req.logger || logger;

    if (!user || !user.permissions) {
      log.warn({ user }, "Acceso denegado: No permisos encontrados");
      return res
        .status(403)
        .json({ message: "Forbidden: No permissions found" });
    }

    const hasPerm = user.permissions.includes(permission);

    if (!hasPerm) {
      log.warn({ user, requiredPermission: permission }, `Acceso denegado: Requiere permiso: ${permission}`);
      return res
        .status(403)
        .json({ message: `Forbidden: Requires permission: ${permission}` });
    }

    log.info({ user, requiredPermission: permission }, "Acceso permitido por permiso");
    next();
  };
