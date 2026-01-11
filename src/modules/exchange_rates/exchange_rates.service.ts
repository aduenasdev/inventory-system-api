import { db } from "../../db/connection";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { eq, and, desc, sql } from "drizzle-orm";

export async function createExchangeRate(data: {
  fromCurrencyId: number;
  toCurrencyId: number;
  rate: number;
  date: string;
}) {
  // Validar que from_currency_id ≠ to_currency_id
  if (data.fromCurrencyId === data.toCurrencyId) {
    throw new Error("La moneda origen y destino no pueden ser iguales");
  }

  // Verificar si ya existe una tasa para ese par de monedas en esa fecha
  const existing = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.fromCurrencyId, data.fromCurrencyId),
        eq(exchangeRates.toCurrencyId, data.toCurrencyId),
        sql`${exchangeRates.date} = ${data.date}`
      )
    );

  if (existing.length > 0) {
    throw new Error(`Ya existe una tasa de cambio para estas monedas en la fecha ${data.date}`);
  }

  const [insert] = await db.insert(exchangeRates).values({
    fromCurrencyId: data.fromCurrencyId,
    toCurrencyId: data.toCurrencyId,
    rate: data.rate.toString(),
    date: new Date(data.date),
  });
  return { id: insert.insertId, ...data };
}

export async function getAllExchangeRates() {
  return db.select().from(exchangeRates);
}

export async function getExchangeRateById(exchangeRateId: number) {
  const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.id, exchangeRateId));
  return rows[0] || null;
}

export async function getLatestExchangeRate(fromCurrencyId: number, toCurrencyId: number) {
  const rows = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.fromCurrencyId, fromCurrencyId),
        eq(exchangeRates.toCurrencyId, toCurrencyId)
      )
    )
    .orderBy(desc(exchangeRates.date))
    .limit(1);

  return rows[0] || null;
}

export async function updateExchangeRate(
  exchangeRateId: number,
  data: {
    rate?: number;
    date?: string;
  }
) {
  const updateData: any = {};

  if (data.rate !== undefined) updateData.rate = data.rate.toString();
  if (data.date) updateData.date = new Date(data.date);

  await db.update(exchangeRates).set(updateData).where(eq(exchangeRates.id, exchangeRateId));
  
  // Retornar la tasa de cambio actualizada
  const [updated] = await db.select().from(exchangeRates).where(eq(exchangeRates.id, exchangeRateId));
  return updated;
}

export async function deleteExchangeRate(exchangeRateId: number) {
  await db.delete(exchangeRates).where(eq(exchangeRates.id, exchangeRateId));
  return { message: "Tasa de cambio eliminada" };
}
