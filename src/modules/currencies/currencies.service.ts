import { db } from "../../db/connection";
import { currencies } from "../../db/schema/currencies";
import { eq } from "drizzle-orm";

export async function createCurrency(data: {
  name: string;
  code: string;
  symbol: string;
  decimalPlaces?: number;
}) {
  // Verificar si ya existe una moneda con ese nombre
  const existingName = await db.select().from(currencies).where(eq(currencies.name, data.name));
  if (existingName.length > 0) {
    throw new Error(`Ya existe una moneda con el nombre "${data.name}"`);
  }

  // Verificar si ya existe una moneda con ese código
  const existingCode = await db.select().from(currencies).where(eq(currencies.code, data.code));
  if (existingCode.length > 0) {
    throw new Error(`Ya existe una moneda con el código "${data.code}"`);
  }

  const [insert] = await db.insert(currencies).values(data);
  return { id: insert.insertId, ...data };
}

export async function getAllCurrencies() {
  return db.select().from(currencies);
}

export async function getCurrencyById(currencyId: number) {
  const rows = await db.select().from(currencies).where(eq(currencies.id, currencyId));
  return rows[0] || null;
}

export async function updateCurrency(
  currencyId: number,
  data: {
    name?: string;
    code?: string;
    symbol?: string;
    decimalPlaces?: number;
  }
) {
  const updateData: any = {};

  if (data.name) {
    const existing = await db.select().from(currencies).where(eq(currencies.name, data.name));
    if (existing.length > 0 && existing[0].id !== currencyId) {
      throw new Error(`El nombre "${data.name}" ya está en uso por otra moneda`);
    }
    updateData.name = data.name;
  }

  if (data.code) {
    const existing = await db.select().from(currencies).where(eq(currencies.code, data.code));
    if (existing.length > 0 && existing[0].id !== currencyId) {
      throw new Error(`El código "${data.code}" ya está en uso por otra moneda`);
    }
    updateData.code = data.code;
  }

  if (data.symbol) updateData.symbol = data.symbol;
  if (data.decimalPlaces !== undefined) updateData.decimalPlaces = data.decimalPlaces;

  await db.update(currencies).set(updateData).where(eq(currencies.id, currencyId));
  return { message: "Moneda actualizada" };
}

export async function disableCurrency(currencyId: number) {
  await db.update(currencies).set({ isActive: false }).where(eq(currencies.id, currencyId));
  return { message: "Moneda deshabilitada" };
}

export async function enableCurrency(currencyId: number) {
  await db.update(currencies).set({ isActive: true }).where(eq(currencies.id, currencyId));
  return { message: "Moneda habilitada" };
}
