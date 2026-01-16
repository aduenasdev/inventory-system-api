import { db } from "../../db/connection";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { eq, and, desc, sql } from "drizzle-orm";
import { normalizeBusinessDate, isWithinLastDays } from "../../utils/date";
import { ValidationError, ConflictError, NotFoundError, ForbiddenError } from "../../utils/errors";

export async function createExchangeRate(data: {
  toCurrencyId: number;
  rate: number;
  date: string;
}) {
  const fromCurrencyId = 1; // CUP es siempre la moneda base/origen

  // Normalizar fecha a YYYY-MM-DD (acepta con o sin hora)
  const normalizedDate = normalizeBusinessDate(data.date);

  // Validar que toCurrencyId no sea CUP
  if (data.toCurrencyId === 1) {
    throw new ValidationError("No se puede crear tasa de CUP a CUP. Use otra moneda como destino");
  }

  // Validar que la fecha esté dentro de los últimos 4 días
  if (!isWithinLastDays(normalizedDate, 4)) {
    throw new ValidationError("No se pueden crear tasas de cambio de más de 4 días atrás");
  }

  // Verificar si ya existe una tasa para esa moneda en esa fecha
  const existing = await db
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.fromCurrencyId, fromCurrencyId),
        eq(exchangeRates.toCurrencyId, data.toCurrencyId),
        sql`${exchangeRates.date} = ${normalizedDate}`
      )
    );

  if (existing.length > 0) {
    throw new ConflictError(`Ya existe una tasa de cambio de CUP a esta moneda en la fecha ${normalizedDate}`);
  }

  const [insert] = await db.insert(exchangeRates).values({
    fromCurrencyId: fromCurrencyId,
    toCurrencyId: data.toCurrencyId,
    rate: data.rate.toString(),
    date: normalizedDate,
  });
  return { id: insert.insertId, fromCurrencyId, toCurrencyId: data.toCurrencyId, rate: data.rate, date: normalizedDate };
}

export async function getAllExchangeRates(startDate?: string, endDate?: string) {
  const query = sql`
    SELECT 
      er.id,
      er.from_currency_id as fromCurrencyId,
      er.to_currency_id as toCurrencyId,
      er.rate,
      er.date,
      er.created_at as createdAt,
      er.updated_at as updatedAt,
      c_from.id as fromCurrency_id,
      c_from.name as fromCurrency_name,
      c_from.code as fromCurrency_code,
      c_from.symbol as fromCurrency_symbol,
      c_to.id as toCurrency_id,
      c_to.name as toCurrency_name,
      c_to.code as toCurrency_code,
      c_to.symbol as toCurrency_symbol
    FROM exchange_rates er
    INNER JOIN currencies c_from ON er.from_currency_id = c_from.id
    INNER JOIN currencies c_to ON er.to_currency_id = c_to.id
    ${startDate ? sql`WHERE er.date >= ${startDate} AND er.date <= ${endDate || startDate}` : sql``}
    ORDER BY er.date DESC
  `;

  const [rows] = await db.execute(query);
  
  // Transformar el resultado para incluir objetos de monedas completos
  return (rows as unknown as any[]).map(row => ({
    id: row.id,
    fromCurrencyId: row.fromCurrencyId,
    toCurrencyId: row.toCurrencyId,
    rate: row.rate,
    date: row.date,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fromCurrency: {
      id: row.fromCurrency_id,
      name: row.fromCurrency_name,
      code: row.fromCurrency_code,
      symbol: row.fromCurrency_symbol
    },
    toCurrency: {
      id: row.toCurrency_id,
      name: row.toCurrency_name,
      code: row.toCurrency_code,
      symbol: row.toCurrency_symbol
    }
  }));
}

export async function getExchangeRateById(exchangeRateId: number) {
  const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.id, exchangeRateId));
  return rows[0] || null;
}

export async function getLatestExchangeRate(toCurrencyId: number) {
  const fromCurrencyId = 1; // CUP es siempre la moneda base/origen
  
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
  // Obtener la tasa actual para validar la fecha
  const [existingRate] = await db.select().from(exchangeRates).where(eq(exchangeRates.id, exchangeRateId));
  
  if (!existingRate) {
    throw new NotFoundError("Tasa de cambio no encontrada");
  }

  // Validar que la tasa no sea de más de 4 días atrás
  if (!isWithinLastDays(existingRate.date, 4)) {
    throw new ForbiddenError("No se pueden editar tasas de cambio de más de 4 días atrás");
  }

  const updateData: any = {};

  if (data.rate !== undefined) updateData.rate = data.rate.toString();
  if (data.date) {
    // Normalizar y validar la nueva fecha
    const normalizedNewDate = normalizeBusinessDate(data.date);
    if (!isWithinLastDays(normalizedNewDate, 4)) {
      throw new ValidationError("No se puede mover la tasa a una fecha de más de 4 días atrás");
    }
    updateData.date = normalizedNewDate;
  }

  await db.update(exchangeRates).set(updateData).where(eq(exchangeRates.id, exchangeRateId));
  
  // Retornar la tasa de cambio actualizada
  const [updated] = await db.select().from(exchangeRates).where(eq(exchangeRates.id, exchangeRateId));
  return updated;
}

export async function createBatchExchangeRates(data: {
  date: string;
  rates: { toCurrencyId: number; rate: number }[];
}) {
  console.log('🔧 Processing batch:', data);
  const fromCurrencyId = 1; // CUP es siempre la moneda base/origen
  const results = [];

  // Normalizar fecha a YYYY-MM-DD
  const normalizedDate = normalizeBusinessDate(data.date);
  console.log('📅 Normalized date:', normalizedDate);

  // Validar que ninguna tasa sea para CUP
  const hasCUP = data.rates.some(r => r.toCurrencyId === 1);
  if (hasCUP) {
    throw new ValidationError("No se puede crear tasa de CUP a CUP. Elimine CUP de la lista");
  }

  // Validar que la fecha esté dentro de los últimos 4 días
  if (!isWithinLastDays(normalizedDate, 4)) {
    throw new ValidationError("No se pueden crear o editar tasas de cambio de más de 4 días atrás");
  }

  for (const rateData of data.rates) {
    // Verificar si ya existe una tasa para esa moneda en esa fecha
    const existing = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrencyId, fromCurrencyId),
          eq(exchangeRates.toCurrencyId, rateData.toCurrencyId),
          sql`${exchangeRates.date} = ${normalizedDate}`
        )
      );

    if (existing.length > 0) {
      // Validar que la tasa existente esté dentro de los últimos 4 días
      if (!isWithinLastDays(existing[0].date, 4)) {
        throw new ForbiddenError(`La tasa para la moneda ${rateData.toCurrencyId} tiene más de 4 días y no puede ser modificada`);
      }
      
      // Actualizar tasa existente
      await db
        .update(exchangeRates)
        .set({ rate: rateData.rate.toString() })
        .where(eq(exchangeRates.id, existing[0].id));
      
      results.push({
        id: existing[0].id,
        fromCurrencyId,
        toCurrencyId: rateData.toCurrencyId,
        rate: rateData.rate,
        date: normalizedDate,
        action: 'updated'
      });
    } else {
      // Crear nueva tasa
      const [insert] = await db.insert(exchangeRates).values({
        fromCurrencyId,
        toCurrencyId: rateData.toCurrencyId,
        rate: rateData.rate.toString(),
        date: normalizedDate,
      });
      
      results.push({
        id: insert.insertId,
        fromCurrencyId,
        toCurrencyId: rateData.toCurrencyId,
        rate: rateData.rate,
        date: normalizedDate,
        action: 'created'
      });
    }
  }

  return results;
}

export async function getCurrentExchangeRates() {
  // Obtener la tasa más reciente de CUP a cada moneda activa
  const query = sql`
    SELECT 
      c.id as currencyId,
      c.name as currencyName,
      c.code as currencyCode,
      c.symbol as currencySymbol,
      er.id as exchangeRateId,
      er.rate,
      er.date
    FROM currencies c
    LEFT JOIN (
      SELECT 
        er1.*
      FROM exchange_rates er1
      INNER JOIN (
        SELECT to_currency_id, MAX(date) as max_date
        FROM exchange_rates
        WHERE from_currency_id = 1
        GROUP BY to_currency_id
      ) er2 ON er1.to_currency_id = er2.to_currency_id AND er1.date = er2.max_date
      WHERE er1.from_currency_id = 1
    ) er ON c.id = er.to_currency_id
    WHERE c.is_active = TRUE AND c.id != 1
    ORDER BY c.code
  `;

  const result = await db.execute(query);
  return result[0];
}
