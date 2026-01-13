import { db } from "../../db/connection";
import { roles } from "../../db/schema/roles";
import { rolePermissions } from "../../db/schema/role_permissions";
import { permissions } from "../../db/schema/permissions";
import { userRoles } from "../../db/schema/user_roles";
import { eq, sql } from "drizzle-orm";

export async function createRole(data: { name: string; description?: string }) {
  // Verificar si ya existe un rol con ese nombre
  const existing = await db.select().from(roles).where(eq(roles.name, data.name));
  if (existing.length > 0) {
    throw new Error(`Ya existe un rol con el nombre "${data.name}"`);
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
      throw new Error(`El nombre "${data.name}" ya está en uso por otro rol`);
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
    throw new Error("El rol ya tiene ese permiso asignado");
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
    throw new Error("No se puede eliminar el rol porque está asignado a usuarios");
  }

  // Delete associated permissions
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

  // Delete the role
  await db.delete(roles).where(eq(roles.id, roleId));

  return { message: "Rol eliminado exitosamente" };
}
