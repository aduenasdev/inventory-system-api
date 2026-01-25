import { db } from "../../db/connection";
import { roles } from "../../db/schema/roles";
import { rolePermissions } from "../../db/schema/role_permissions";
import { permissions } from "../../db/schema/permissions";
import { userRoles } from "../../db/schema/user_roles";
import { eq, sql } from "drizzle-orm";
import { ConflictError, ValidationError } from "../../utils/errors";

export async function createRole(data: { name: string; description?: string }) {
  // Verificar si ya existe un rol con ese nombre
  const existing = await db.select().from(roles).where(eq(roles.name, data.name));
  if (existing.length > 0) {
    throw new ConflictError(`Ya existe un rol con el nombre "${data.name}"`);
  }
  
  const [newRole] = await db.insert(roles).values(data);
  return { id: newRole.insertId, ...data };
}

export async function getAllRoles() {
  return db.select().from(roles);
}

export async function getRoleById(roleId: number) {
  const rows = await db.select().from(roles).where(eq(roles.id, roleId));
  return rows[0] || null;
}

export async function updateRole(roleId: number, data: { name?: string; description?: string }) {
  const updateData: any = {};
  
  if (data.name) {
    // Verificar si el nombre ya está en uso por otro rol
    const existing = await db.select().from(roles).where(eq(roles.name, data.name));
    if (existing.length > 0 && existing[0].id !== roleId) {
      throw new ConflictError(`El nombre "${data.name}" ya está en uso por otro rol`);
    }
    updateData.name = data.name;
  }
  
  if (data.description !== undefined) updateData.description = data.description;
  await db.update(roles).set(updateData).where(eq(roles.id, roleId));
  
  // Retornar el rol actualizado
  const [updated] = await db.select().from(roles).where(eq(roles.id, roleId));
  return updated;
}

export async function addPermissionToRole(roleId: number, permissionId: number) {
  // Verificar si el rol ya tiene ese permiso
  const existing = await db
    .select()
    .from(rolePermissions)
    .where(sql`${rolePermissions.roleId} = ${roleId} AND ${rolePermissions.permissionId} = ${permissionId}`);
  
  if (existing.length > 0) {
    throw new ConflictError("El rol ya tiene ese permiso asignado");
  }
  
  await db.insert(rolePermissions).values({ roleId, permissionId });
  return { message: "Permiso agregado al rol" };
}

export async function getPermissionsForRole(roleId: number) {
  const result = await db
    .select({
      permission: permissions.name,
      description: permissions.description,
      group: permissions.group,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));

  return result;
}

export async function deleteRole(roleId: number) {
  // Check if the role is in use
  const usersWithRole = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.roleId, roleId))
    .limit(1);

  if (usersWithRole.length > 0) {
    throw new ValidationError("No se puede eliminar el rol porque está asignado a usuarios");
  }

  // Delete associated permissions
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

  // Delete the role
  await db.delete(roles).where(eq(roles.id, roleId));

  return { message: "Rol eliminado exitosamente" };
}

export async function removePermissionFromRole(roleId: number, permissionId: number) {
  // Verificar que el rol existe
  const role = await getRoleById(roleId);
  if (!role) {
    throw new ValidationError("Rol no encontrado");
  }

  // Verificar que el permiso está asignado al rol
  const existing = await db
    .select()
    .from(rolePermissions)
    .where(sql`${rolePermissions.roleId} = ${roleId} AND ${rolePermissions.permissionId} = ${permissionId}`);

  if (existing.length === 0) {
    throw new ValidationError("El rol no tiene ese permiso asignado");
  }

  await db
    .delete(rolePermissions)
    .where(sql`${rolePermissions.roleId} = ${roleId} AND ${rolePermissions.permissionId} = ${permissionId}`);

  return { message: "Permiso removido del rol" };
}

export async function replaceRolePermissions(roleId: number, permissionIds: number[]) {
  // Verificar que el rol existe
  const role = await getRoleById(roleId);
  if (!role) {
    throw new ValidationError("Rol no encontrado");
  }

  // Verificar que todos los permisos existen
  if (permissionIds.length > 0) {
    const existingPermissions = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(sql`${permissions.id} IN (${sql.join(permissionIds.map(id => sql`${id}`), sql`, `)})`);

    if (existingPermissions.length !== permissionIds.length) {
      const foundIds = existingPermissions.map(p => p.id);
      const notFound = permissionIds.filter(id => !foundIds.includes(id));
      throw new ValidationError(`Permisos no encontrados: ${notFound.join(", ")}`);
    }
  }

  // Eliminar todos los permisos actuales del rol
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

  // Insertar los nuevos permisos
  if (permissionIds.length > 0) {
    await db.insert(rolePermissions).values(
      permissionIds.map(permissionId => ({ roleId, permissionId }))
    );
  }

  // Retornar los permisos actualizados
  const updatedPermissions = await getPermissionsForRole(roleId);
  return {
    message: "Permisos actualizados exitosamente",
    permissions: updatedPermissions,
    count: updatedPermissions.length
  };
}
