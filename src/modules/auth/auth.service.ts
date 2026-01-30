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
import { ConflictError, UnauthorizedError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { RegisterUserInput, LoginUserInput, ChangePasswordInput } from "./auth.schemas";
import { generateMailPassword, generateMaildir } from "../../utils/mailCrypt";

export async function registerUser(data: RegisterUserInput) {
  const { email, password } = data.body;

  const existingUser = await db.select().from(users).where(eq(users.email, email));

  if (existingUser.length > 0) {
    throw new ConflictError("Ya existe un usuario con este email");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const mailPassword = await generateMailPassword(password);
  const maildir = generateMaildir(email);

  const [newUser] = await db.insert(users).values({
    email,
    password: hashedPassword,
    nombre: email.split('@')[0], // Nombre temporal desde email
    mailPassword: mailPassword,
    maildir: maildir
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
  const { email, password } = data.body;

  try {
    const result = await db.select().from(users).where(eq(users.email, email));
    const [user] = result;

    if (!user) {
      throw new UnauthorizedError("Email o contraseña inválidos");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedError("Email o contraseña inválidos");
    }

    // Verificar si el usuario está habilitado
    if (!user.enabled) {
      throw new ForbiddenError("Usuario deshabilitado. Contacte al administrador");
    }

    // Sincronizar mail_password y maildir si son NULL (retrocompatibilidad)
    const updateData: any = { lastLogin: new Date() };
    if (!user.mailPassword) {
      updateData.mailPassword = generateMailPassword(password);
    }
    if (!user.maildir) {
      updateData.maildir = generateMaildir(user.email);
    }
    
    // Update user data (mail_password, maildir, and lastLogin) in single query
    await db.update(users).set(updateData).where(eq(users.id, user.id));

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

    // Extract flat arrays for roles and permissions
    const roleNames = rolesForUser.map(r => r.roleName.toLowerCase());
    const allPermissions = [...new Set(rolePermRows.map(p => p.permissionName))];

    return {
      user: { 
        id: user.id, 
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono
      },
      roles: roleNames,
      permissions: allPermissions,
      accessToken,
      refreshToken,
    };
  } catch (error) {
    throw error;
  }
}

export async function refreshTokenService(token: string) {
  if (!token) {
    throw new UnauthorizedError("Refresh token no proporcionado");
  }

  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { userId: number };

    const [existingToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token));

    if (!existingToken) {
      throw new UnauthorizedError("Refresh token inválido");
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
    throw new UnauthorizedError("Refresh token inválido o expirado");
  }
}

export async function changePassword(userId: number, data: ChangePasswordInput) {
  const { currentPassword, newPassword } = data.body;

  // Get user from database
  const [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user) {
    throw new NotFoundError("Usuario no encontrado");
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

  if (!isPasswordValid) {
    throw new UnauthorizedError("La contraseña actual es incorrecta");
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const mailPassword = await generateMailPassword(newPassword);

  // Update password and mail password
  await db.update(users).set({ password: hashedPassword, mailPassword: mailPassword }).where(eq(users.id, userId));

  return { message: "Contraseña actualizada exitosamente" };
}
