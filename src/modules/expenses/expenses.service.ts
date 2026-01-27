import { db } from "../../db/connection";
import { expenses } from "../../db/schema/expenses";
import { expenseTypes } from "../../db/schema/expense_types";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { users } from "../../db/schema/users";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { eq, and, sql, desc, gte, lte, inArray, aliasedTable } from "drizzle-orm";
import { normalizeBusinessDate, getTodayDateString } from "../../utils/date";
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from "../../utils/errors";

const BASE_CURRENCY_ID = 1; // CUP

// Alias para usuarios
const createdByUser = aliasedTable(users, "created_by_user");
const acceptedByUser = aliasedTable(users, "accepted_by_user");
const cancelledByUser = aliasedTable(users, "cancelled_by_user");

// Interface para tipado
interface Expense {
  id: number;
  expenseNumber: string;
  date: string;
  expenseTypeId: number;
  expenseTypeName: string;
  warehouseId: number;
  warehouseName: string;
  amount: string;
  currencyId: number;
  currencyCode: string;
  currencySymbol: string;
  exchangeRate: string | null;
  amountBase: string | null;
  description: string | null;
  status: "PENDING" | "APPROVED" | "CANCELLED";
  cancellationReason: string | null;
  createdBy: number;
  createdByName: string;
  acceptedBy: number | null;
  acceptedByName: string | null;
  cancelledBy: number | null;
  cancelledByName: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
}

export class ExpensesService {
  // Generar número de gasto
  private async generateExpenseNumber(tx?: any): Promise<string> {
    const database = tx || db;
    const year = new Date().getFullYear();
    const [lastExpense] = await database
      .select()
      .from(expenses)
      .where(sql`expense_number LIKE ${`GS-${year}%`}`)
      .orderBy(desc(expenses.id))
      .limit(1)
      .for("update");

    let nextNumber = 1;
    if (lastExpense) {
      const lastNumber = parseInt(lastExpense.expenseNumber.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    return `GS-${year}-${nextNumber.toString().padStart(5, "0")}`;
  }

  // Validar que el usuario pertenece al almacén
  private async validateUserBelongsToWarehouse(userId: number, warehouseId: number): Promise<void> {
    const [userWarehouse] = await db
      .select()
      .from(userWarehouses)
      .where(
        and(
          eq(userWarehouses.userId, userId),
          eq(userWarehouses.warehouseId, warehouseId)
        )
      );

    if (!userWarehouse) {
      throw new ForbiddenError("No tienes permiso para registrar gastos en este almacén");
    }
  }

  // Obtener tasa de cambio a CUP
  private async getExchangeRateToCUP(fromCurrencyId: number, date: string): Promise<number> {
    if (fromCurrencyId === BASE_CURRENCY_ID) {
      return 1;
    }

    const [currency] = await db
      .select({ name: currencies.name, code: currencies.code })
      .from(currencies)
      .where(eq(currencies.id, fromCurrencyId));

    const currencyName = currency ? `${currency.name} (${currency.code})` : `ID ${fromCurrencyId}`;

    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrencyId, BASE_CURRENCY_ID),
          eq(exchangeRates.toCurrencyId, fromCurrencyId),
          sql`DATE(${exchangeRates.date}) = ${date}`
        )
      );

    if (!rate) {
      throw new NotFoundError(
        `No existe tasa de cambio para la fecha ${date} de ${currencyName} a CUP. Debe crearla antes de continuar.`
      );
    }

    return parseFloat(rate.rate);
  }

  // Obtener almacenes del usuario
  async getUserWarehouses(userId: number) {
    return await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
        direccion: warehouses.direccion,
      })
      .from(userWarehouses)
      .innerJoin(warehouses, eq(userWarehouses.warehouseId, warehouses.id))
      .where(
        and(
          eq(userWarehouses.userId, userId),
          eq(warehouses.active, true)
        )
      )
      .orderBy(warehouses.name);
  }

  // Obtener tipos de gasto activos
  async getExpenseTypes() {
    return await db
      .select()
      .from(expenseTypes)
      .where(eq(expenseTypes.isActive, true))
      .orderBy(expenseTypes.name);
  }

  // Obtener monedas activas
  async getCurrencies() {
    return await db
      .select({
        id: currencies.id,
        code: currencies.code,
        symbol: currencies.symbol,
        name: currencies.name,
      })
      .from(currencies)
      .where(eq(currencies.isActive, true))
      .orderBy(currencies.id);
  }

  // ========== CREAR GASTO ==========
  async create(data: {
    expenseTypeId: number;
    warehouseId: number;
    date?: string;
    amount: number;
    currencyId: number;
    description?: string;
    userId: number;
  }) {
    // Validar que el usuario pertenece al almacén
    await this.validateUserBelongsToWarehouse(data.userId, data.warehouseId);

    // Validar monto
    if (data.amount <= 0) {
      throw new ValidationError("El monto debe ser mayor a 0");
    }

    // Validar que el tipo de gasto existe y está activo
    const [expenseType] = await db
      .select()
      .from(expenseTypes)
      .where(eq(expenseTypes.id, data.expenseTypeId));

    if (!expenseType) {
      throw new NotFoundError("Tipo de gasto no encontrado");
    }

    if (!expenseType.isActive) {
      throw new ValidationError("El tipo de gasto no está activo");
    }

    // Validar almacén
    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, data.warehouseId));

    if (!warehouse) {
      throw new NotFoundError("Almacén no encontrado");
    }

    // Validar moneda
    const [currency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.id, data.currencyId));

    if (!currency) {
      throw new NotFoundError("Moneda no encontrada");
    }

    // Fecha del gasto
    const today = getTodayDateString();
    const expenseDate = data.date ? normalizeBusinessDate(data.date) : today;

    if (expenseDate > today) {
      throw new ValidationError("No se pueden crear gastos con fecha futura");
    }

    // Crear en transacción
    return await db.transaction(async (tx) => {
      const expenseNumber = await this.generateExpenseNumber(tx);

      const [result] = (await tx.insert(expenses).values({
        expenseNumber,
        expenseTypeId: data.expenseTypeId,
        warehouseId: data.warehouseId,
        date: sql`${expenseDate}`,
        amount: data.amount.toString(),
        currencyId: data.currencyId,
        description: data.description || null,
        status: "PENDING",
        createdBy: data.userId,
      })) as any;

      return result.insertId;
    }).then(async (expenseId) => {
      const expense = await this.getById(expenseId);
      return {
        message: "Gasto creado exitosamente. Pendiente de aprobación.",
        data: expense,
      };
    });
  }

  // ========== OBTENER TODOS LOS GASTOS ==========
  async getAll(
    userId: number,
    startDate: string,
    endDate: string,
    warehouseId?: number,
    expenseTypeId?: number,
    status?: string
  ) {
    // Obtener almacenes del usuario
    const userWarehouseIds = (await this.getUserWarehouses(userId)).map((w) => w.id);

    if (userWarehouseIds.length === 0) {
      return [];
    }

    const conditions: any[] = [
      gte(expenses.date, sql`${startDate}`),
      lte(expenses.date, sql`${endDate}`),
      inArray(expenses.warehouseId, userWarehouseIds),
    ];

    if (warehouseId) {
      if (!userWarehouseIds.includes(warehouseId)) {
        return [];
      }
      conditions.push(eq(expenses.warehouseId, warehouseId));
    }

    if (expenseTypeId) {
      conditions.push(eq(expenses.expenseTypeId, expenseTypeId));
    }

    if (status) {
      conditions.push(eq(expenses.status, status as any));
    }

    return await db
      .select({
        id: expenses.id,
        expenseNumber: expenses.expenseNumber,
        date: sql<string>`DATE_FORMAT(${expenses.date}, '%Y-%m-%d')`.as("date"),
        expenseTypeId: expenses.expenseTypeId,
        expenseTypeName: expenseTypes.name,
        warehouseId: expenses.warehouseId,
        warehouseName: warehouses.name,
        amount: expenses.amount,
        currencyId: expenses.currencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        exchangeRate: expenses.exchangeRate,
        amountBase: expenses.amountBase,
        description: expenses.description,
        status: expenses.status,
        createdBy: expenses.createdBy,
        createdByName: sql<string>`CONCAT(${createdByUser.nombre}, ' ', COALESCE(${createdByUser.apellido}, ''))`.as("created_by_name"),
        acceptedBy: expenses.acceptedBy,
        acceptedByName: sql<string>`CONCAT(${acceptedByUser.nombre}, ' ', COALESCE(${acceptedByUser.apellido}, ''))`.as("accepted_by_name"),
        cancelledBy: expenses.cancelledBy,
        cancelledByName: sql<string>`CONCAT(${cancelledByUser.nombre}, ' ', COALESCE(${cancelledByUser.apellido}, ''))`.as("cancelled_by_name"),
        createdAt: expenses.createdAt,
        acceptedAt: expenses.acceptedAt,
        cancelledAt: expenses.cancelledAt,
      })
      .from(expenses)
      .innerJoin(expenseTypes, eq(expenses.expenseTypeId, expenseTypes.id))
      .innerJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(expenses.currencyId, currencies.id))
      .innerJoin(createdByUser, eq(expenses.createdBy, createdByUser.id))
      .leftJoin(acceptedByUser, eq(expenses.acceptedBy, acceptedByUser.id))
      .leftJoin(cancelledByUser, eq(expenses.cancelledBy, cancelledByUser.id))
      .where(and(...conditions))
      .orderBy(desc(expenses.createdAt));
  }

  // ========== OBTENER GASTO POR ID ==========
  async getById(id: number) {
    const [expense] = await db
      .select({
        id: expenses.id,
        expenseNumber: expenses.expenseNumber,
        date: sql<string>`DATE_FORMAT(${expenses.date}, '%Y-%m-%d')`.as("date"),
        expenseTypeId: expenses.expenseTypeId,
        expenseTypeName: expenseTypes.name,
        warehouseId: expenses.warehouseId,
        warehouseName: warehouses.name,
        amount: expenses.amount,
        currencyId: expenses.currencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        exchangeRate: expenses.exchangeRate,
        amountBase: expenses.amountBase,
        description: expenses.description,
        status: expenses.status,
        cancellationReason: expenses.cancellationReason,
        createdBy: expenses.createdBy,
        createdByName: sql<string>`CONCAT(${createdByUser.nombre}, ' ', COALESCE(${createdByUser.apellido}, ''))`.as("created_by_name"),
        acceptedBy: expenses.acceptedBy,
        acceptedByName: sql<string>`CONCAT(${acceptedByUser.nombre}, ' ', COALESCE(${acceptedByUser.apellido}, ''))`.as("accepted_by_name"),
        cancelledBy: expenses.cancelledBy,
        cancelledByName: sql<string>`CONCAT(${cancelledByUser.nombre}, ' ', COALESCE(${cancelledByUser.apellido}, ''))`.as("cancelled_by_name"),
        createdAt: expenses.createdAt,
        acceptedAt: expenses.acceptedAt,
        cancelledAt: expenses.cancelledAt,
      })
      .from(expenses)
      .innerJoin(expenseTypes, eq(expenses.expenseTypeId, expenseTypes.id))
      .innerJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(expenses.currencyId, currencies.id))
      .innerJoin(createdByUser, eq(expenses.createdBy, createdByUser.id))
      .leftJoin(acceptedByUser, eq(expenses.acceptedBy, acceptedByUser.id))
      .leftJoin(cancelledByUser, eq(expenses.cancelledBy, cancelledByUser.id))
      .where(eq(expenses.id, id));

    if (!expense) {
      throw new NotFoundError("Gasto no encontrado");
    }

    return expense as Expense;
  }

  // ========== APROBAR GASTO ==========
  async accept(id: number, userId: number) {
    const expense = await this.getById(id);

    if (expense.status !== "PENDING") {
      throw new ValidationError("Solo se pueden aprobar gastos en estado PENDING");
    }

    const expenseDate = expense.date;

    // Obtener tasa de cambio
    const exchangeRate = await this.getExchangeRateToCUP(expense.currencyId, expenseDate);
    const amount = parseFloat(expense.amount);
    const amountBase = amount * exchangeRate;

    await db
      .update(expenses)
      .set({
        status: "APPROVED",
        exchangeRate: exchangeRate.toString(),
        amountBase: amountBase.toString(),
        acceptedBy: userId,
        acceptedAt: new Date(),
      })
      .where(eq(expenses.id, id));

    const updatedExpense = await this.getById(id);
    return {
      message: "Gasto aprobado exitosamente.",
      data: updatedExpense,
    };
  }

  // ========== CANCELAR GASTO ==========
  async cancel(id: number, cancellationReason: string, userId: number) {
    const expense = await this.getById(id);

    // Solo el creador puede cancelar
    if (expense.createdBy !== userId) {
      throw new ForbiddenError("Solo puedes cancelar tus propios gastos");
    }

    if (expense.status === "CANCELLED") {
      throw new ConflictError("El gasto ya está cancelado");
    }

    await db
      .update(expenses)
      .set({
        status: "CANCELLED",
        cancellationReason,
        cancelledBy: userId,
        cancelledAt: new Date(),
      })
      .where(eq(expenses.id, id));

    const updatedExpense = await this.getById(id);
    return {
      message: "Gasto cancelado exitosamente.",
      data: updatedExpense,
    };
  }

  // ========== RESUMEN DE GASTOS ==========
  async getSummary(
    userId: number,
    startDate: string,
    endDate: string,
    warehouseId?: number
  ) {
    // Obtener almacenes del usuario
    const userWarehouseIds = (await this.getUserWarehouses(userId)).map((w) => w.id);

    if (userWarehouseIds.length === 0) {
      return { total: 0, byType: [], byWarehouse: [] };
    }

    const conditions: any[] = [
      gte(expenses.date, sql`${startDate}`),
      lte(expenses.date, sql`${endDate}`),
      inArray(expenses.warehouseId, userWarehouseIds),
      eq(expenses.status, "APPROVED"),
    ];

    if (warehouseId) {
      if (!userWarehouseIds.includes(warehouseId)) {
        return { total: 0, byType: [], byWarehouse: [] };
      }
      conditions.push(eq(expenses.warehouseId, warehouseId));
    }

    // Total general
    const [totalResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${expenses.amountBase}), 0)`.as("total"),
      })
      .from(expenses)
      .where(and(...conditions));

    // Por tipo de gasto
    const byType = await db
      .select({
        expenseTypeId: expenses.expenseTypeId,
        expenseTypeName: expenseTypes.name,
        total: sql<string>`SUM(${expenses.amountBase})`.as("total"),
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(expenses)
      .innerJoin(expenseTypes, eq(expenses.expenseTypeId, expenseTypes.id))
      .where(and(...conditions))
      .groupBy(expenses.expenseTypeId, expenseTypes.name)
      .orderBy(desc(sql`total`));

    // Por almacén
    const byWarehouse = await db
      .select({
        warehouseId: expenses.warehouseId,
        warehouseName: warehouses.name,
        total: sql<string>`SUM(${expenses.amountBase})`.as("total"),
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(expenses)
      .innerJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .where(and(...conditions))
      .groupBy(expenses.warehouseId, warehouses.name)
      .orderBy(desc(sql`total`));

    return {
      total: parseFloat(totalResult.total),
      byType: byType.map((t) => ({
        ...t,
        total: parseFloat(t.total),
      })),
      byWarehouse: byWarehouse.map((w) => ({
        ...w,
        total: parseFloat(w.total),
      })),
    };
  }

  // Reporte detallado de gastos
  async getReport(
    userId: number,
    startDate: string,
    endDate: string,
    warehouseId?: number,
    expenseTypeId?: number,
    limit: number = 10
  ) {
    // Obtener almacenes del usuario
    const userWarehouseIds = (await this.getUserWarehouses(userId)).map((w) => w.id);

    if (userWarehouseIds.length === 0) {
      return {
        period: { startDate, endDate },
        totals: { approved: 0, pending: 0, cancelled: 0 },
        byType: [],
        byWarehouse: [],
        byMonth: [],
        topExpenses: [],
      };
    }

    // Condiciones base
    const baseConditions: any[] = [
      gte(expenses.date, sql`${startDate}`),
      lte(expenses.date, sql`${endDate}`),
      inArray(expenses.warehouseId, userWarehouseIds),
    ];

    if (warehouseId) {
      if (!userWarehouseIds.includes(warehouseId)) {
        return {
          period: { startDate, endDate },
          totals: { approved: 0, pending: 0, cancelled: 0 },
          byType: [],
          byWarehouse: [],
          byMonth: [],
          topExpenses: [],
        };
      }
      baseConditions.push(eq(expenses.warehouseId, warehouseId));
    }

    if (expenseTypeId) {
      baseConditions.push(eq(expenses.expenseTypeId, expenseTypeId));
    }

    // 1. Totales por estado
    const totalsResult = await db
      .select({
        status: expenses.status,
        total: sql<string>`COALESCE(SUM(${expenses.amountBase}), 0)`.as("total"),
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(expenses)
      .where(and(...baseConditions))
      .groupBy(expenses.status);

    const totals = {
      approved: 0,
      approvedCount: 0,
      pending: 0,
      pendingCount: 0,
      cancelled: 0,
      cancelledCount: 0,
    };

    totalsResult.forEach((row) => {
      if (row.status === "APPROVED") {
        totals.approved = parseFloat(row.total);
        totals.approvedCount = row.count;
      } else if (row.status === "PENDING") {
        totals.pending = parseFloat(row.total);
        totals.pendingCount = row.count;
      } else if (row.status === "CANCELLED") {
        totals.cancelled = parseFloat(row.total);
        totals.cancelledCount = row.count;
      }
    });

    // Condiciones solo aprobados
    const approvedConditions = [...baseConditions, eq(expenses.status, "APPROVED")];

    // 2. Por tipo de gasto (solo aprobados)
    const byType = await db
      .select({
        expenseTypeId: expenses.expenseTypeId,
        expenseTypeName: expenseTypes.name,
        total: sql<string>`SUM(${expenses.amountBase})`.as("total"),
        count: sql<number>`COUNT(*)`.as("count"),
        percentage: sql<string>`ROUND(SUM(${expenses.amountBase}) * 100 / NULLIF((SELECT SUM(amount_base) FROM expenses WHERE status = 'APPROVED' AND date >= ${startDate} AND date <= ${endDate} AND warehouse_id IN (${sql.raw(userWarehouseIds.join(","))})), 0), 2)`.as("percentage"),
      })
      .from(expenses)
      .innerJoin(expenseTypes, eq(expenses.expenseTypeId, expenseTypes.id))
      .where(and(...approvedConditions))
      .groupBy(expenses.expenseTypeId, expenseTypes.name)
      .orderBy(desc(sql`total`));

    // 3. Por almacén (solo aprobados)
    const byWarehouse = await db
      .select({
        warehouseId: expenses.warehouseId,
        warehouseName: warehouses.name,
        total: sql<string>`SUM(${expenses.amountBase})`.as("total"),
        count: sql<number>`COUNT(*)`.as("count"),
        percentage: sql<string>`ROUND(SUM(${expenses.amountBase}) * 100 / NULLIF((SELECT SUM(amount_base) FROM expenses WHERE status = 'APPROVED' AND date >= ${startDate} AND date <= ${endDate} AND warehouse_id IN (${sql.raw(userWarehouseIds.join(","))})), 0), 2)`.as("percentage"),
      })
      .from(expenses)
      .innerJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .where(and(...approvedConditions))
      .groupBy(expenses.warehouseId, warehouses.name)
      .orderBy(desc(sql`total`));

    // 4. Por mes (solo aprobados)
    const byMonth = await db
      .select({
        month: sql<string>`DATE_FORMAT(${expenses.date}, '%Y-%m')`.as("month"),
        total: sql<string>`SUM(${expenses.amountBase})`.as("total"),
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(expenses)
      .where(and(...approvedConditions))
      .groupBy(sql`DATE_FORMAT(${expenses.date}, '%Y-%m')`)
      .orderBy(sql`month`);

    // 5. Top gastos más grandes (solo aprobados)
    const topExpenses = await db
      .select({
        id: expenses.id,
        expenseNumber: expenses.expenseNumber,
        date: expenses.date,
        expenseTypeName: expenseTypes.name,
        warehouseName: warehouses.name,
        amount: expenses.amount,
        currencyCode: currencies.code,
        amountBase: expenses.amountBase,
        description: expenses.description,
      })
      .from(expenses)
      .innerJoin(expenseTypes, eq(expenses.expenseTypeId, expenseTypes.id))
      .innerJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(expenses.currencyId, currencies.id))
      .where(and(...approvedConditions))
      .orderBy(desc(expenses.amountBase))
      .limit(limit);

    return {
      period: { startDate, endDate },
      totals,
      byType: byType.map((t) => ({
        ...t,
        total: parseFloat(t.total),
        percentage: parseFloat(t.percentage || "0"),
      })),
      byWarehouse: byWarehouse.map((w) => ({
        ...w,
        total: parseFloat(w.total),
        percentage: parseFloat(w.percentage || "0"),
      })),
      byMonth: byMonth.map((m) => ({
        ...m,
        total: parseFloat(m.total),
      })),
      topExpenses: topExpenses.map((e) => ({
        ...e,
        amount: parseFloat(e.amount),
        amountBase: parseFloat(e.amountBase || "0"),
      })),
    };
  }
}

export const expensesService = new ExpensesService();
