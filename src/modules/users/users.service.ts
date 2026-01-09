import { db } from "../../db/connection";
import { userRoles } from "../../db/schema/user_roles";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { and, eq } from "drizzle-orm";
import { users } from "../../db/schema/users";
import bcrypt from "bcrypt";

export async function assignRoleToUser(userId: number, roleId: number) {
  // Verificar si el usuario ya tiene ese rol
  const existing = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  
  if (existing.length > 0) {
    throw new Error("El usuario ya tiene ese rol asignado");
  }
  
  await db.insert(userRoles).values({ userId, roleId });
  return { message: "Rol asignado al usuario" };
}

export async function removeRoleFromUser(userId: number, roleId: number) {
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  return { message: "Rol removido del usuario" };
}

export async function createUser(data: { 
  email: string; 
  password: string; 
  nombre: string;
  apellido?: string;
  telefono?: string;
  roleIds: number[]; 
  warehouseIds?: number[] 
}) {
  // Verificar si ya existe un usuario con ese email
  const existing = await db.select().from(users).where(eq(users.email, data.email));
  if (existing.length > 0) {
    throw new Error(`Ya existe un usuario con el email "${data.email}"`);
  }
  
  const hashed = await bcrypt.hash(data.password, 10);
  const [insert] = await db.insert(users).values({ 
    email: data.email, 
    password: hashed,
    nombre: data.nombre,
    apellido: data.apellido,
    telefono: data.telefono
  });
  
  // Assign roles to the user
  if (data.roleIds && data.roleIds.length > 0) {
    const roleAssignments = data.roleIds.map(roleId => ({
      userId: insert.insertId,
      roleId: roleId
    }));
    await db.insert(userRoles).values(roleAssignments);
  }
  
  // Assign warehouses to the user
  if (data.warehouseIds && data.warehouseIds.length > 0) {
    const warehouseAssignments = data.warehouseIds.map(warehouseId => ({
      userId: insert.insertId,
      warehouseId: warehouseId
    }));
    await db.insert(userWarehouses).values(warehouseAssignments);
  }
  
  return { id: insert.insertId, email: data.email };
}

export async function getAllUsers() {
  return db.select().from(users);
}

export async function getUserById(userId: number) {
  const rows = await db.select().from(users).where(eq(users.id, userId));
  return rows[0] || null;
}

export async function updateUser(userId: number, data: { 
  email?: string; 
  password?: string;
  nombre?: string;
  apellido?: string;
  telefono?: string;
}) {
  const updateData: any = {};
  
  if (data.email) {
    // Verificar si el email ya está en uso por otro usuario
    const existing = await db.select().from(users).where(eq(users.email, data.email));
    if (existing.length > 0 && existing[0].id !== userId) {
      throw new Error(`El email "${data.email}" ya está en uso por otro usuario`);
    }
    updateData.email = data.email;
  }
  
  if (data.password) updateData.password = await bcrypt.hash(data.password, 10);
  if (data.nombre) updateData.nombre = data.nombre;
  if (data.apellido !== undefined) updateData.apellido = data.apellido;
  if (data.telefono !== undefined) updateData.telefono = data.telefono;
  
  await db.update(users).set(updateData).where(eq(users.id, userId));
  return { message: "Usuario actualizado" };
}

export async function disableUser(userId: number) {
  await db.update(users).set({ enabled: false }).where(eq(users.id, userId));
  return { message: "Usuario deshabilitado" };
}

export async function enableUser(userId: number) {
  await db.update(users).set({ enabled: true }).where(eq(users.id, userId));
  return { message: "Usuario habilitado" };
}
