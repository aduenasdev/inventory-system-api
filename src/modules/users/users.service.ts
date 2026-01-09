import { db } from "../../db/connection";
import { userRoles } from "../../db/schema/user_roles";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { and, eq } from "drizzle-orm";
import { users } from "../../db/schema/users";
import bcrypt from "bcrypt";

export async function assignRoleToUser(userId: number, roleId: number) {
  await db.insert(userRoles).values({ userId, roleId });
  return { message: "Role assigned to user" };
}

export async function removeRoleFromUser(userId: number, roleId: number) {
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  return { message: "Role removed from user" };
}

export async function createUser(data: { email: string; password: string; roleIds: number[]; warehouseIds?: number[] }) {
  const hashed = await bcrypt.hash(data.password, 10);
  const [insert] = await db.insert(users).values({ email: data.email, password: hashed });
  
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

export async function updateUser(userId: number, data: { email?: string; password?: string }) {
  const updateData: any = {};
  if (data.email) updateData.email = data.email;
  if (data.password) updateData.password = await bcrypt.hash(data.password, 10);
  await db.update(users).set(updateData).where(eq(users.id, userId));
  return { message: "User updated" };
}

export async function deleteUser(userId: number) {
  // Cascade will remove user_roles and refresh tokens
  await db.delete(users).where(eq(users.id, userId));
  return { message: "User deleted" };
}
