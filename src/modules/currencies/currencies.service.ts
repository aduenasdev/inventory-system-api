import { db } from "../../db/connection";
import { currencies } from "../../db/schema/currencies";
import { products } from "../../db/schema/products";
import { purchases } from "../../db/schema/purchases";
import { sales } from "../../db/schema/sales";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { eq, or } from "drizzle-orm";

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

export async function getAllCurrencies(activeFilter?: boolean) {
  if (activeFilter !== undefined) {
    return db.select().from(currencies).where(eq(currencies.isActive, activeFilter));
  }
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
  
  // Retornar la moneda actualizada
  const [updated] = await db.select().from(currencies).where(eq(currencies.id, currencyId));
  return updated;
}

export async function disableCurrency(currencyId: number) {
  await db.update(currencies).set({ isActive: false }).where(eq(currencies.id, currencyId));
  return { message: "Moneda deshabilitada" };
}

export async function enableCurrency(currencyId: number) {
  await db.update(currencies).set({ isActive: true }).where(eq(currencies.id, currencyId));
  return { message: "Moneda habilitada" };
}

export async function deleteCurrency(currencyId: number) {
  // Verificar si la moneda está asociada a productos
  const productsWithCurrency = await db
    .select()
    .from(products)
    .where(eq(products.currencyId, currencyId))
    .limit(1);

  if (productsWithCurrency.length > 0) {
    throw new Error("No se puede eliminar la moneda porque tiene productos asociados");
  }

  // Verificar si está asociada a compras
  const purchasesWithCurrency = await db
    .select()
    .from(purchases)
    .where(eq(purchases.currencyId, currencyId))
    .limit(1);

  if (purchasesWithCurrency.length > 0) {
    throw new Error("No se puede eliminar la moneda porque tiene facturas de compra asociadas");
  }

  // Verificar si está asociada a ventas
  const salesWithCurrency = await db
    .select()
    .from(sales)
    .where(eq(sales.currencyId, currencyId))
    .limit(1);

  if (salesWithCurrency.length > 0) {
    throw new Error("No se puede eliminar la moneda porque tiene facturas de venta asociadas");
  }

  // Verificar si está en tasas de cambio (from o to)
  const exchangeRatesWithCurrency = await db
    .select()
    .from(exchangeRates)
    .where(
      or(
        eq(exchangeRates.fromCurrencyId, currencyId),
        eq(exchangeRates.toCurrencyId, currencyId)
      )
    )
    .limit(1);

  if (exchangeRatesWithCurrency.length > 0) {
    throw new Error("No se puede eliminar la moneda porque tiene tasas de cambio asociadas");
  }

  // Si no tiene asociaciones, eliminar
  await db.delete(currencies).where(eq(currencies.id, currencyId));
  return { message: "Moneda eliminada exitosamente" };
}
