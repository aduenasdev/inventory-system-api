import { db } from "../../db/connection";
import { users } from "../../db/schema/users";
import { refreshTokens } from "../../db/schema/refresh_tokens";
import { userRoles } from "../../db/schema/user_roles";
import { roles } from "../../db/schema/roles";
import { rolePermissions } from "../../db/schema/role_permissions";
import { permissions } from "../../db/schema/permissions";
import { eq, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { generateTokens } from "../../utils/jwt";
import { RegisterUserInput, LoginUserInput } from "./auth.schemas";

export async function registerUser(data: RegisterUserInput) {
  const { email, password } = data;

  const existingUser = await db.select().from(users).where(eq(users.email, email));

  if (existingUser.length > 0) {
    throw new Error("User with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const [newUser] = await db.insert(users).values({
    email,
    password: hashedPassword,
  });

  // Assign default 'user' role via pivot
  const userRoleRow = await db.select().from(roles).where(eq(roles.name, 'user'));
  const defaultRoleId = userRoleRow[0]?.id;
  if (defaultRoleId) {
    await db.insert(userRoles).values({ userId: newUser.insertId, roleId: defaultRoleId });
  }

  const { accessToken, refreshToken } = generateTokens({ userId: newUser.insertId });

  await db.insert(refreshTokens).values({
    token: refreshToken,
    userId: newUser.insertId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  // Build roles with permissions for response
  const rolesForUser = await db
    .select({ roleId: roles.id, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, newUser.insertId));

  const roleIds = rolesForUser.map(r => r.roleId);
  let rolePermRows: Array<{ roleId: number; roleName: string; permissionName: string }> = [];
  if (roleIds.length > 0) {
    const rows = await db
      .select({ roleId: rolePermissions.roleId, roleName: roles.name, permissionName: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
      .where(inArray(rolePermissions.roleId, roleIds));
    rolePermRows = rows as any;
  }

  const rolesWithPermissions = rolesForUser.map(r => ({
    name: r.roleName,
    permissions: rolePermRows.filter(p => p.roleId === r.roleId).map(p => p.permissionName),
  }));

  return {
    user: { id: newUser.insertId, email },
    roles: rolesWithPermissions,
    accessToken,
    refreshToken,
  };
}

export async function loginUser(data: LoginUserInput) {
  const { email, password } = data;

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  const { accessToken, refreshToken } = generateTokens({ userId: user.id });

  await db.insert(refreshTokens).values({
    token: refreshToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });

  // Build roles with permissions for response
  const rolesForUser = await db
    .select({ roleId: roles.id, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id));

  const roleIds = rolesForUser.map(r => r.roleId);
  let rolePermRows: Array<{ roleId: number; roleName: string; permissionName: string }> = [];
  if (roleIds.length > 0) {
    const rows = await db
      .select({ roleId: rolePermissions.roleId, roleName: roles.name, permissionName: permissions.name })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .innerJoin(roles, eq(rolePermissions.roleId, roles.id))
      .where(inArray(rolePermissions.roleId, roleIds));
    rolePermRows = rows as any;
  }

  const rolesWithPermissions = rolesForUser.map(r => ({
    name: r.roleName,
    permissions: rolePermRows.filter(p => p.roleId === r.roleId).map(p => p.permissionName),
  }));

  return {
    user: { id: user.id, email: user.email },
    roles: rolesWithPermissions,
    accessToken,
    refreshToken,
  };
}

export async function refreshTokenService(token: string) {
  if (!token) {
    throw new Error("Refresh token not provided");
  }

  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { userId: number };

    const [existingToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token));

    if (!existingToken) {
      throw new Error("Invalid refresh token");
    }

    // Revoke the old refresh token
    await db.delete(refreshTokens).where(eq(refreshTokens.id, existingToken.id));

    const { accessToken, refreshToken } = generateTokens({
      userId: decoded.userId,
    });

    // Store the new refresh token
    await db.insert(refreshTokens).values({
      token: refreshToken,
      userId: decoded.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new Error("Invalid or expired refresh token");
  }
}
