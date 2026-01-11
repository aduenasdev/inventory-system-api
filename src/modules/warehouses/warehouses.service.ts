import { db } from "../../db/connection";
import { warehouses } from "../../db/schema/warehouses";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { users } from "../../db/schema/users";
import { eq, and } from "drizzle-orm";

export async function createWarehouse(data: { 
  name: string; 
  provincia: string; 
  municipio: string; 
  direccion?: string; 
  ubicacion?: string;
  active?: boolean;
}) {
  // Verificar si ya existe un almacén con ese nombre
  const existing = await db.select().from(warehouses).where(eq(warehouses.name, data.name));
  if (existing.length > 0) {
    throw new Error(`Ya existe un almacén con el nombre "${data.name}"`);
  }
  
  const [insert] = await db.insert(warehouses).values(data);
  return { id: insert.insertId, ...data };
}

export async function getAllWarehouses(activeFilter?: boolean) {
  if (activeFilter !== undefined) {
    return db.select().from(warehouses).where(eq(warehouses.active, activeFilter));
  }
  return db.select().from(warehouses);
}

export async function getWarehouseById(warehouseId: number) {
  const rows = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
  const warehouse = rows[0] || null;
  return warehouse;
}

export async function updateWarehouse(
  warehouseId: number, 
  data: { 
    name?: string; 
    provincia?: string; 
    municipio?: string; 
    direccion?: string; 
    ubicacion?: string;
    active?: boolean;
  }
) {
  const updateData: any = {};
  
  if (data.name !== undefined) {
    // Verificar si el nombre ya está en uso por otro almacén
    const existing = await db.select().from(warehouses).where(eq(warehouses.name, data.name));
    if (existing.length > 0 && existing[0].id !== warehouseId) {
      throw new Error(`El nombre "${data.name}" ya está en uso por otro almacén`);
    }
    updateData.name = data.name;
  }
  
  if (data.provincia !== undefined) updateData.provincia = data.provincia;
  if (data.municipio !== undefined) updateData.municipio = data.municipio;
  if (data.direccion !== undefined) updateData.direccion = data.direccion;
  if (data.ubicacion !== undefined) updateData.ubicacion = data.ubicacion;
  if (data.active !== undefined) updateData.active = data.active;
  
  await db.update(warehouses).set(updateData).where(eq(warehouses.id, warehouseId));
  
  // Retornar el almacén actualizado
  const [updated] = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
  return updated;
}

export async function deleteWarehouse(warehouseId: number) {
  // Verificar si el almacén tiene usuarios asignados
  const usersInWarehouse = await db
    .select()
    .from(userWarehouses)
    .where(eq(userWarehouses.warehouseId, warehouseId))
    .limit(1);
  
  if (usersInWarehouse.length > 0) {
    throw new Error("No se puede eliminar el almacén porque tiene usuarios asignados");
  }
  
  await db.delete(warehouses).where(eq(warehouses.id, warehouseId));
  return { message: "Almacén eliminado" };
}

export async function assignUserToWarehouse(warehouseId: number, userId: number) {
  // Verificar si el usuario ya está asignado a ese almacén
  const existing = await db
    .select()
    .from(userWarehouses)
    .where(and(eq(userWarehouses.warehouseId, warehouseId), eq(userWarehouses.userId, userId)));
  
  if (existing.length > 0) {
    throw new Error("El usuario ya está asignado a ese almacén");
  }
  
  await db.insert(userWarehouses).values({ warehouseId, userId });
  return { message: "Usuario asignado al almacén" };
}

export async function removeUserFromWarehouse(warehouseId: number, userId: number) {
  await db
    .delete(userWarehouses)
    .where(and(eq(userWarehouses.warehouseId, warehouseId), eq(userWarehouses.userId, userId)));
  return { message: "Usuario removido del almacén" };
}

export async function getUsersInWarehouse(warehouseId: number) {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
      lastLogin: users.lastLogin,
    })
    .from(userWarehouses)
    .innerJoin(users, eq(userWarehouses.userId, users.id))
    .where(eq(userWarehouses.warehouseId, warehouseId));
  
  return result;
}
