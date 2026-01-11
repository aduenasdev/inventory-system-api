import { db } from "../../db/connection";
import { units } from "../../db/schema/units";
import { eq, and } from "drizzle-orm";

export async function createUnit(data: {
  name: string;
  shortName: string;
  description?: string;
  type: string;
}) {
  // Verificar si ya existe una unidad con ese nombre
  const existingName = await db.select().from(units).where(eq(units.name, data.name));
  if (existingName.length > 0) {
    throw new Error(`Ya existe una unidad con el nombre "${data.name}"`);
  }

  // Verificar si ya existe una unidad con ese nombre corto
  const existingShortName = await db.select().from(units).where(eq(units.shortName, data.shortName));
  if (existingShortName.length > 0) {
    throw new Error(`Ya existe una unidad con el nombre corto "${data.shortName}"`);
  }

  const [insert] = await db.insert(units).values(data);
  return { id: insert.insertId, ...data };
}

export async function getAllUnits(activeFilter?: boolean) {
  if (activeFilter !== undefined) {
    return db.select().from(units).where(eq(units.isActive, activeFilter));
  }
  return db.select().from(units);
}

export async function getUnitById(unitId: number) {
  const rows = await db.select().from(units).where(eq(units.id, unitId));
  return rows[0] || null;
}

export async function updateUnit(
  unitId: number,
  data: {
    name?: string;
    shortName?: string;
    description?: string;
    type?: string;
  }
) {
  const updateData: any = {};

  if (data.name) {
    // Verificar si el nombre ya está en uso por otra unidad
    const existing = await db.select().from(units).where(eq(units.name, data.name));
    if (existing.length > 0 && existing[0].id !== unitId) {
      throw new Error(`El nombre "${data.name}" ya está en uso por otra unidad`);
    }
    updateData.name = data.name;
  }

  if (data.shortName) {
    // Verificar si el nombre corto ya está en uso por otra unidad
    const existing = await db.select().from(units).where(eq(units.shortName, data.shortName));
    if (existing.length > 0 && existing[0].id !== unitId) {
      throw new Error(`El nombre corto "${data.shortName}" ya está en uso por otra unidad`);
    }
    updateData.shortName = data.shortName;
  }

  if (data.description !== undefined) updateData.description = data.description;
  if (data.type) updateData.type = data.type;

  await db.update(units).set(updateData).where(eq(units.id, unitId));
  
  // Retornar la unidad actualizada
  const [updated] = await db.select().from(units).where(eq(units.id, unitId));
  return updated;
}

export async function disableUnit(unitId: number) {
  await db.update(units).set({ isActive: false }).where(eq(units.id, unitId));
  return { message: "Unidad deshabilitada" };
}

export async function enableUnit(unitId: number) {
  await db.update(units).set({ isActive: true }).where(eq(units.id, unitId));
  return { message: "Unidad habilitada" };
}
