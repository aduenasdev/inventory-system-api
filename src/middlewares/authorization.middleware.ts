import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { ForbiddenError } from "../utils/errors";


export const hasPermission = (permission: string) => (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;
    const log = req.logger || logger;

    if (!user || !user.permissions) {
      log.warn({ userId: user?.id }, "Acceso denegado: No permisos encontrados");
      throw new ForbiddenError("No se encontraron permisos");
    }

    const hasPerm = user.permissions.includes(permission);

    if (!hasPerm) {
      log.warn({ userId: user.id, requiredPermission: permission }, `Acceso denegado: Requiere permiso: ${permission}`);
      throw new ForbiddenError(`Requiere permiso: ${permission}`);
    }

    log.info({ userId: user.id, requiredPermission: permission }, "Acceso permitido por permiso");
    next();
  };
