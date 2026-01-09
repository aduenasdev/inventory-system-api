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
  ubicacion?: string 
}) {
  const [insert] = await db.insert(warehouses).values(data);
  return { id: insert.insertId, ...data };
}

export async function getAllWarehouses() {
  return db.select().from(warehouses);
}

export async function getWarehouseById(warehouseId: number) {
  const rows = await db.select().from(warehouses).where(eq(warehouses.id, warehouseId));
  return rows[0] || null;
}

export async function updateWarehouse(
  warehouseId: number, 
  data: { 
    name?: string; 
    provincia?: string; 
    municipio?: string; 
    direccion?: string; 
    ubicacion?: string 
  }
) {
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.provincia !== undefined) updateData.provincia = data.provincia;
  if (data.municipio !== undefined) updateData.municipio = data.municipio;
  if (data.direccion !== undefined) updateData.direccion = data.direccion;
  if (data.ubicacion !== undefined) updateData.ubicacion = data.ubicacion;
  
  await db.update(warehouses).set(updateData).where(eq(warehouses.id, warehouseId));
  return { message: "Warehouse updated" };
}

export async function deleteWarehouse(warehouseId: number) {
  // Cascade will remove user_warehouses associations
  await db.delete(warehouses).where(eq(warehouses.id, warehouseId));
  return { message: "Warehouse deleted" };
}

export async function assignUserToWarehouse(warehouseId: number, userId: number) {
  await db.insert(userWarehouses).values({ warehouseId, userId });
  return { message: "User assigned to warehouse" };
}

export async function removeUserFromWarehouse(warehouseId: number, userId: number) {
  await db
    .delete(userWarehouses)
    .where(and(eq(userWarehouses.warehouseId, warehouseId), eq(userWarehouses.userId, userId)));
  return { message: "User removed from warehouse" };
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
