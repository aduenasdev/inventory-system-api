import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db/connection";
import { users } from "../db/schema/users";
import { roles } from "../db/schema/roles";
import { userRoles } from "../db/schema/user_roles";
import { permissions } from "../db/schema/permissions";
import { rolePermissions } from "../db/schema/role_permissions";
import { eq, inArray } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

    // 1. Get user basic info
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, decoded.userId));

    if (!user) {
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }

    // 2. Get user roles
    const userRolesResult = await db
      .select({ roleName: roles.name, roleId: roles.id })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));

    if (userRolesResult.length === 0) {
      res.locals.user = { ...user, roles: [], permissions: [] };
      return next();
    }

    const roleNames = userRolesResult.map((r) => r.roleName);
    const roleIds = userRolesResult.map((r) => r.roleId);

    // 3. Get permissions for those roles
    const permissionsResult = await db
      .selectDistinct({ permissionName: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));

    const permissionNames = permissionsResult.map((p) => p.permissionName);

    // 4. Attach to res.locals
    res.locals.user = {
      ...user,
      roles: roleNames,
      permissions: permissionNames,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
}
