import { Request, Response, NextFunction } from "express";

export const isRole =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;

    if (!user || !user.roles) {
      return res.status(403).json({ message: "Forbidden: No roles found" });
    }

    const hasRole = roles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      return res
        .status(403)
        .json({ message: `Forbidden: Requires one of roles: ${roles.join(", ")}` });
    }

    next();
  };

export const hasPermission =
  (permission: string) => (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;

    if (!user || !user.permissions) {
      return res
        .status(403)
        .json({ message: "Forbidden: No permissions found" });
    }

    const hasPerm = user.permissions.includes(permission);

    if (!hasPerm) {
      return res
        .status(403)
        .json({ message: `Forbidden: Requires permission: ${permission}` });
    }

    next();
  };
