import { db } from "../../db/connection";
import { adjustments } from "../../db/schema/adjustments";
import { adjustmentsDetail } from "../../db/schema/adjustments_detail";
import { adjustmentTypes } from "../../db/schema/adjustment_types";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { lotConsumptions } from "../../db/schema/lot_consumptions";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { users } from "../../db/schema/users";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { categories } from "../../db/schema/categories";
import { units } from "../../db/schema/units";
import { eq, and, sql, desc, gte, lte, inArray, or, like, gt, asc, aliasedTable } from "drizzle-orm";
import { normalizeBusinessDate, getTodayDateString } from "../../utils/date";
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from "../../utils/errors";
import { lotService } from "../inventory/lots.service";

const BASE_CURRENCY_ID = 1; // CUP

// Alias para usuarios
const createdByUser = aliasedTable(users, "created_by_user");
const acceptedByUser = aliasedTable(users, "accepted_by_user");
const cancelledByUser = aliasedTable(users, "cancelled_by_user");

// Interfaces para tipado
interface AdjustmentDetail {
  id: number;
  productId: number;
  productName: string;
  productCode: string;
  quantity: string;
  currencyId: number | null;
  currencyCode: string | null;
  currencySymbol: string | null;
  unitCost: string | null;
  exchangeRate: string | null;
  unitCostBase: string | null;
  lotId: number | null;
}

interface AdjustmentWithDetails {
  id: number;
  adjustmentNumber: string;
  date: string;
  adjustmentTypeId: number;
  adjustmentTypeName: string;
  affectsPositively: boolean;
  warehouseId: number;
  warehouseName: string;
  status: "PENDING" | "APPROVED" | "CANCELLED";
  reason: string | null;
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
  details: AdjustmentDetail[];
}

export class AdjustmentsService {
  // Generar número de ajuste
  private async generateAdjustmentNumber(tx?: any): Promise<string> {
    const database = tx || db;
    const year = new Date().getFullYear();
    const [lastAdjustment] = await database
      .select()
      .from(adjustments)
      .where(sql`adjustment_number LIKE ${`AJ-${year}%`}`)
      .orderBy(desc(adjustments.id))
      .limit(1)
      .for("update");

    let nextNumber = 1;
    if (lastAdjustment) {
      const lastNumber = parseInt(lastAdjustment.adjustmentNumber.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    return `AJ-${year}-${nextNumber.toString().padStart(5, "0")}`;
  }

  // Validar que el usuario pertenece al establecimiento
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
      throw new ForbiddenError("No tienes permiso para realizar ajustes en este establecimiento");
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

  // Obtener establecimientos del usuario
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

  // Obtener tipos de ajuste
  async getAdjustmentTypes() {
    return await db
      .select()
      .from(adjustmentTypes)
      .orderBy(adjustmentTypes.name);
  }

  // Obtener productos con stock en un establecimiento (para salidas)
  async getProductsWithStock(warehouseId: number, search?: string) {
    const conditions: any[] = [
      eq(inventoryLots.warehouseId, warehouseId),
      eq(inventoryLots.status, "ACTIVE"),
      gt(inventoryLots.currentQuantity, "0"),
    ];

    const lotsData = await db
      .select({
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        categoryId: products.categoryId,
        categoryName: categories.name,
        unitId: products.unitId,
        unitName: units.name,
        unitShortName: units.shortName,
        availableStock: sql<string>`SUM(${inventoryLots.currentQuantity})`.as("available_stock"),
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(units, eq(products.unitId, units.id))
      .where(and(...conditions))
      .groupBy(inventoryLots.productId, products.id, categories.id, units.id);

    let result = lotsData;

    if (search) {
      const searchLower = search.toLowerCase();
      result = lotsData.filter(
        (p) =>
          p.productName.toLowerCase().includes(searchLower) ||
          p.productCode.toLowerCase().includes(searchLower)
      );
    }

    return result.map((p) => ({
      id: p.productId,
      code: p.productCode,
      name: p.productName,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      unitId: p.unitId,
      unitName: p.unitName,
      unitShortName: p.unitShortName,
      availableStock: p.availableStock,
    }));
  }

  // Obtener todos los productos (para entradas)
  async getAllProducts(search?: string, categoryId?: number) {
    const conditions: any[] = [];

    if (search) {
      conditions.push(
        or(
          like(products.name, `%${search}%`),
          like(products.code, `%${search}%`)
        )
      );
    }

    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    return await db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        unitId: products.unitId,
        unitName: units.name,
        unitShortName: units.shortName,
        minStock: products.minStock,
        reorderPoint: products.reorderPoint,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(units, eq(products.unitId, units.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(products.name);
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

  // ========== CREAR AJUSTE ==========
  async create(data: {
    adjustmentTypeId: number;
    warehouseId: number;
    date?: string;
    reason?: string;
    details: Array<{
      productId: number;
      quantity: number;
      currencyId?: number;
      unitCost?: number;
    }>;
    userId: number;
  }) {
    // Validar que el usuario pertenece al establecimiento
    await this.validateUserBelongsToWarehouse(data.userId, data.warehouseId);

    // Validar que hay detalles
    if (!data.details || data.details.length === 0) {
      throw new ValidationError("El ajuste debe tener al menos un producto");
    }

    // Validar que el tipo de ajuste existe
    const [adjustmentType] = await db
      .select()
      .from(adjustmentTypes)
      .where(eq(adjustmentTypes.id, data.adjustmentTypeId));

    if (!adjustmentType) {
      throw new NotFoundError("Tipo de ajuste no encontrado");
    }

    // Validar establecimiento
    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, data.warehouseId));

    if (!warehouse) {
      throw new NotFoundError("Establecimiento no encontrado");
    }

    // Fecha del ajuste
    const today = getTodayDateString();
    const adjustmentDate = data.date ? normalizeBusinessDate(data.date) : today;

    if (adjustmentDate > today) {
      throw new ValidationError("No se pueden crear ajustes con fecha futura");
    }

    // Validar detalles según tipo de ajuste
    const isEntry = adjustmentType.affectsPositively;

    for (let i = 0; i < data.details.length; i++) {
      const detail = data.details[i];

      if (detail.quantity <= 0) {
        throw new ValidationError(`La cantidad en línea ${i + 1} debe ser mayor a 0`);
      }

      // Validar producto existe
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, detail.productId));

      if (!product) {
        throw new NotFoundError(`Producto con ID ${detail.productId} no encontrado`);
      }

      // Para entradas, obtener el último costo conocido del producto
      if (isEntry) {
        const lastCost = await lotService.getLastKnownCost(detail.productId);
        if (!lastCost) {
          throw new ValidationError(
            `El producto "${product.name}" no tiene historial de costos. Debe realizar una compra primero para establecer el costo.`
          );
        }
        // Asignar valores del último costo
        (detail as any).currencyId = lastCost.originalCurrencyId;
        (detail as any).unitCost = lastCost.originalUnitCost;
      } else {
        // Para salidas, validar stock
        const availableStock = await lotService.getStockFromLots(data.warehouseId, detail.productId);
        if (availableStock < detail.quantity) {
          const [prod] = await db.select().from(products).where(eq(products.id, detail.productId));
          throw new ValidationError(
            `Stock insuficiente para "${prod.name}". Disponible: ${availableStock.toFixed(2)}, Solicitado: ${detail.quantity}`
          );
        }
      }
    }

    // Crear en transacción
    return await db.transaction(async (tx) => {
      const adjustmentNumber = await this.generateAdjustmentNumber(tx);

      const [result] = (await tx.insert(adjustments).values({
        adjustmentNumber,
        adjustmentTypeId: data.adjustmentTypeId,
        warehouseId: data.warehouseId,
        date: sql`${adjustmentDate}`,
        status: "PENDING",
        reason: data.reason || null,
        createdBy: data.userId,
      })) as any;

      const adjustmentId = result.insertId;

      // Insertar detalles
      for (const detail of data.details) {
        await tx.insert(adjustmentsDetail).values({
          adjustmentId,
          productId: detail.productId,
          quantity: detail.quantity.toString(),
          currencyId: isEntry ? detail.currencyId : null,
          unitCost: isEntry ? detail.unitCost!.toString() : null,
        });
      }

      return adjustmentId;
    }).then(async (adjustmentId) => {
      const adjustment = await this.getById(adjustmentId);
      return {
        message: "Ajuste creado exitosamente. Pendiente de aprobación.",
        data: adjustment,
      };
    });
  }

  // ========== OBTENER TODOS LOS AJUSTES ==========
  async getAll(
    userId: number,
    startDate: string,
    endDate: string,
    warehouseId?: number,
    status?: string
  ) {
    // Obtener establecimientos del usuario
    const userWarehouseIds = (await this.getUserWarehouses(userId)).map((w) => w.id);

    if (userWarehouseIds.length === 0) {
      return [];
    }

    const conditions: any[] = [
      gte(adjustments.date, sql`${startDate}`),
      lte(adjustments.date, sql`${endDate}`),
      inArray(adjustments.warehouseId, userWarehouseIds),
    ];

    if (warehouseId) {
      if (!userWarehouseIds.includes(warehouseId)) {
        return [];
      }
      conditions.push(eq(adjustments.warehouseId, warehouseId));
    }

    if (status) {
      conditions.push(eq(adjustments.status, status as any));
    }

    return await db
      .select({
        id: adjustments.id,
        adjustmentNumber: adjustments.adjustmentNumber,
        date: sql<string>`DATE_FORMAT(${adjustments.date}, '%Y-%m-%d')`.as("date"),
        adjustmentTypeId: adjustments.adjustmentTypeId,
        adjustmentTypeName: adjustmentTypes.name,
        affectsPositively: adjustmentTypes.affectsPositively,
        warehouseId: adjustments.warehouseId,
        warehouseName: warehouses.name,
        status: adjustments.status,
        reason: adjustments.reason,
        createdBy: adjustments.createdBy,
        createdByName: sql<string>`CONCAT(${createdByUser.nombre}, ' ', COALESCE(${createdByUser.apellido}, ''))`.as("created_by_name"),
        acceptedBy: adjustments.acceptedBy,
        acceptedByName: sql<string>`CONCAT(${acceptedByUser.nombre}, ' ', COALESCE(${acceptedByUser.apellido}, ''))`.as("accepted_by_name"),
        cancelledBy: adjustments.cancelledBy,
        cancelledByName: sql<string>`CONCAT(${cancelledByUser.nombre}, ' ', COALESCE(${cancelledByUser.apellido}, ''))`.as("cancelled_by_name"),
        createdAt: adjustments.createdAt,
        acceptedAt: adjustments.acceptedAt,
        cancelledAt: adjustments.cancelledAt,
      })
      .from(adjustments)
      .innerJoin(adjustmentTypes, eq(adjustments.adjustmentTypeId, adjustmentTypes.id))
      .innerJoin(warehouses, eq(adjustments.warehouseId, warehouses.id))
      .innerJoin(createdByUser, eq(adjustments.createdBy, createdByUser.id))
      .leftJoin(acceptedByUser, eq(adjustments.acceptedBy, acceptedByUser.id))
      .leftJoin(cancelledByUser, eq(adjustments.cancelledBy, cancelledByUser.id))
      .where(and(...conditions))
      .orderBy(desc(adjustments.createdAt));
  }

  // ========== OBTENER AJUSTE POR ID ==========
  async getById(id: number) {
    const [adjustment] = await db
      .select({
        id: adjustments.id,
        adjustmentNumber: adjustments.adjustmentNumber,
        date: sql<string>`DATE_FORMAT(${adjustments.date}, '%Y-%m-%d')`.as("date"),
        adjustmentTypeId: adjustments.adjustmentTypeId,
        adjustmentTypeName: adjustmentTypes.name,
        affectsPositively: adjustmentTypes.affectsPositively,
        warehouseId: adjustments.warehouseId,
        warehouseName: warehouses.name,
        status: adjustments.status,
        reason: adjustments.reason,
        cancellationReason: adjustments.cancellationReason,
        createdBy: adjustments.createdBy,
        createdByName: sql<string>`CONCAT(${createdByUser.nombre}, ' ', COALESCE(${createdByUser.apellido}, ''))`.as("created_by_name"),
        acceptedBy: adjustments.acceptedBy,
        acceptedByName: sql<string>`CONCAT(${acceptedByUser.nombre}, ' ', COALESCE(${acceptedByUser.apellido}, ''))`.as("accepted_by_name"),
        cancelledBy: adjustments.cancelledBy,
        cancelledByName: sql<string>`CONCAT(${cancelledByUser.nombre}, ' ', COALESCE(${cancelledByUser.apellido}, ''))`.as("cancelled_by_name"),
        createdAt: adjustments.createdAt,
        acceptedAt: adjustments.acceptedAt,
        cancelledAt: adjustments.cancelledAt,
      })
      .from(adjustments)
      .innerJoin(adjustmentTypes, eq(adjustments.adjustmentTypeId, adjustmentTypes.id))
      .innerJoin(warehouses, eq(adjustments.warehouseId, warehouses.id))
      .innerJoin(createdByUser, eq(adjustments.createdBy, createdByUser.id))
      .leftJoin(acceptedByUser, eq(adjustments.acceptedBy, acceptedByUser.id))
      .leftJoin(cancelledByUser, eq(adjustments.cancelledBy, cancelledByUser.id))
      .where(eq(adjustments.id, id));

    if (!adjustment) {
      throw new NotFoundError("Ajuste no encontrado");
    }

    // Obtener detalles
    const details = await db
      .select({
        id: adjustmentsDetail.id,
        productId: adjustmentsDetail.productId,
        productName: products.name,
        productCode: products.code,
        quantity: adjustmentsDetail.quantity,
        currencyId: adjustmentsDetail.currencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        unitCost: adjustmentsDetail.unitCost,
        exchangeRate: adjustmentsDetail.exchangeRate,
        unitCostBase: adjustmentsDetail.unitCostBase,
        lotId: adjustmentsDetail.lotId,
      })
      .from(adjustmentsDetail)
      .innerJoin(products, eq(adjustmentsDetail.productId, products.id))
      .leftJoin(currencies, eq(adjustmentsDetail.currencyId, currencies.id))
      .where(eq(adjustmentsDetail.adjustmentId, id));

    return Object.assign({}, adjustment, { details }) as AdjustmentWithDetails;
  }

  // ========== APROBAR AJUSTE ==========
  async accept(id: number, userId: number) {
    const adjustment = await this.getById(id);

    if (adjustment.status !== "PENDING") {
      throw new ValidationError("Solo se pueden aprobar ajustes en estado PENDING");
    }

    // Permisos: adjustments.accept (global) o adjustments.accept.own (si es el creador)
    const userPermissions: string[] = (global as any).currentUserPermissions || [];
    const isCreator = adjustment.createdBy === userId;
    const hasAccept = userPermissions.includes("adjustments.accept");
    const hasAcceptOwn = userPermissions.includes("adjustments.accept.own");

    if (!hasAccept && !(hasAcceptOwn && isCreator)) {
      throw new Error("No tienes permiso para aprobar este ajuste");
    }

    const isEntry = adjustment.affectsPositively;
    const adjustmentDate = adjustment.date; // Usar fecha del ajuste para tasa de cambio

    // Para salidas, revalidar stock
    if (!isEntry) {
      for (const detail of adjustment.details) {
        const availableStock = await lotService.getStockFromLots(
          adjustment.warehouseId,
          detail.productId
        );
        if (availableStock < parseFloat(detail.quantity)) {
          throw new ValidationError(
            `Stock insuficiente para "${detail.productName}". Disponible: ${availableStock.toFixed(2)}, Solicitado: ${detail.quantity}`
          );
        }
      }
    }

    return await db.transaction(async (tx) => {
      // Actualizar estado
      await tx
        .update(adjustments)
        .set({
          status: "APPROVED",
          acceptedBy: userId,
          acceptedAt: new Date(),
        })
        .where(eq(adjustments.id, id));

      // Procesar cada detalle
      for (let i = 0; i < adjustment.details.length; i++) {
        const detail = adjustment.details[i];
        const quantity = parseFloat(detail.quantity);
        const lineNumber = i + 1;

        if (isEntry) {
          // ENTRADA: Crear lote
          const unitCost = parseFloat(detail.unitCost!);
          const exchangeRate = await this.getExchangeRateToCUP(detail.currencyId!, adjustmentDate);
          const unitCostBase = unitCost * exchangeRate;

          const lotId = await lotService.createLot(
            {
              productId: detail.productId,
              warehouseId: adjustment.warehouseId,
              quantity,
              originalCurrencyId: detail.currencyId!,
              originalUnitCost: unitCost,
              exchangeRate,
              unitCostBase,
              sourceType: "ADJUSTMENT",
              sourceId: id,
              entryDate: adjustmentDate,
            },
            lineNumber,
            tx
          );

          // Actualizar detalle con lotId y tasas
          await tx
            .update(adjustmentsDetail)
            .set({
              lotId,
              exchangeRate: exchangeRate.toString(),
              unitCostBase: unitCostBase.toString(),
            })
            .where(eq(adjustmentsDetail.id, detail.id));

          // Movimiento de inventario
          await tx.insert(inventoryMovements).values({
            type: "ADJUSTMENT_ENTRY",
            status: "APPROVED",
            warehouseId: adjustment.warehouseId,
            productId: detail.productId,
            quantity: detail.quantity,
            reference: adjustment.adjustmentNumber,
            reason: `Entrada por ajuste ${adjustment.adjustmentNumber}: ${adjustment.reason || adjustment.adjustmentTypeName}`,
            lotId,
          });
        } else {
          // SALIDA: Consumir lotes FIFO
          const consumeResult = await lotService.consumeLotsFromWarehouse(
            adjustment.warehouseId,
            detail.productId,
            quantity,
            "ADJUSTMENT",
            "adjustments_detail",
            detail.id,
            tx
          );

          // Movimiento de inventario
          await tx.insert(inventoryMovements).values({
            type: "ADJUSTMENT_EXIT",
            status: "APPROVED",
            warehouseId: adjustment.warehouseId,
            productId: detail.productId,
            quantity: detail.quantity,
            reference: adjustment.adjustmentNumber,
            reason: `Salida por ajuste ${adjustment.adjustmentNumber}: ${adjustment.reason || adjustment.adjustmentTypeName}. Costo: ${consumeResult.totalCost.toFixed(2)}`,
          });
        }
      }

      return id;
    }).then(async (adjustmentId) => {
      const updatedAdjustment = await this.getById(adjustmentId);
      return {
        message: isEntry
          ? "Ajuste aprobado exitosamente. Lotes creados."
          : "Ajuste aprobado exitosamente. Lotes consumidos con FIFO.",
        data: updatedAdjustment,
      };
    });
  }

  // ========== CANCELAR AJUSTE ==========
  async cancel(id: number, cancellationReason: string, userId: number) {
    const adjustment = await this.getById(id);

    // Solo el creador puede cancelar
    if (adjustment.createdBy !== userId) {
      throw new ForbiddenError("Solo puedes cancelar tus propios ajustes");
    }

    if (adjustment.status === "CANCELLED") {
      throw new ConflictError("El ajuste ya está cancelado");
    }

    const wasApproved = adjustment.status === "APPROVED";
    const isEntry = adjustment.affectsPositively;

    // Si estaba PENDING, solo cambiar estado
    if (!wasApproved) {
      await db
        .update(adjustments)
        .set({
          status: "CANCELLED",
          cancellationReason,
          cancelledBy: userId,
          cancelledAt: new Date(),
        })
        .where(eq(adjustments.id, id));

      const updatedAdjustment = await this.getById(id);
      return {
        message: "Ajuste cancelado exitosamente",
        data: updatedAdjustment,
      };
    }

    // Si estaba APPROVED, revertir
    return await db.transaction(async (tx) => {
      await tx
        .update(adjustments)
        .set({
          status: "CANCELLED",
          cancellationReason,
          cancelledBy: userId,
          cancelledAt: new Date(),
        })
        .where(eq(adjustments.id, id));

      if (isEntry) {
        // Revertir ENTRADA: marcar lotes como agotados
        for (const detail of adjustment.details) {
          if (detail.lotId) {
            const [lot] = await tx
              .select()
              .from(inventoryLots)
              .where(eq(inventoryLots.id, detail.lotId));

            if (lot) {
              // Verificar que no tenga consumos (dentro de la transacción para evitar race conditions)
              const hasConsumptions = await lotService.hasConsumptions(lot.id, tx);
              if (hasConsumptions) {
                throw new ConflictError(
                  `No se puede cancelar el ajuste porque el lote ${lot.lotCode} ya tiene consumos registrados.`
                );
              }

              const lotQuantity = parseFloat(lot.currentQuantity);

              await tx
                .update(inventoryLots)
                .set({ status: "EXHAUSTED", currentQuantity: "0" })
                .where(eq(inventoryLots.id, detail.lotId));

              await lotService.updateInventoryCache(
                adjustment.warehouseId,
                detail.productId,
                -lotQuantity,
                tx
              );

              await tx.insert(inventoryMovements).values({
                type: "ADJUSTMENT_EXIT",
                status: "APPROVED",
                warehouseId: adjustment.warehouseId,
                productId: detail.productId,
                quantity: lot.currentQuantity,
                reference: adjustment.adjustmentNumber,
                reason: `Reversión por cancelación de ajuste: ${cancellationReason}`,
                lotId: detail.lotId,
              });
            }
          }
        }
      } else {
        // Revertir SALIDA: recrear lotes
        for (const detail of adjustment.details) {
          // Obtener consumos originales
          const consumptionsData = await tx
            .select({
              lotId: lotConsumptions.lotId,
              quantity: lotConsumptions.quantity,
              originalCurrencyId: inventoryLots.originalCurrencyId,
              originalUnitCost: inventoryLots.originalUnitCost,
              exchangeRate: inventoryLots.exchangeRate,
              lotCode: inventoryLots.lotCode,
              entryDate: inventoryLots.entryDate,
            })
            .from(lotConsumptions)
            .innerJoin(inventoryLots, eq(lotConsumptions.lotId, inventoryLots.id))
            .where(
              and(
                eq(lotConsumptions.referenceType, "adjustments_detail"),
                eq(lotConsumptions.referenceId, detail.id)
              )
            );

          // Recrear lotes con los datos originales de cada consumo
          for (const consumption of consumptionsData) {
            const quantity = parseFloat(consumption.quantity);
            // Usar la fecha original del lote para mantener consistencia contable
            const originalEntryDate = consumption.entryDate 
              ? new Date(consumption.entryDate).toISOString().split('T')[0]
              : adjustment.date;

            await lotService.createLot(
              {
                productId: detail.productId,
                warehouseId: adjustment.warehouseId,
                quantity,
                originalCurrencyId: consumption.originalCurrencyId,
                originalUnitCost: parseFloat(consumption.originalUnitCost),
                exchangeRate: parseFloat(consumption.exchangeRate),
                sourceType: "ADJUSTMENT",
                sourceId: id,
                entryDate: originalEntryDate,
              },
              undefined,
              tx
            );
          }

          // Si hubo consumos, crear movimiento de reversión
          if (consumptionsData.length > 0) {
            await tx.insert(inventoryMovements).values({
              type: "ADJUSTMENT_ENTRY",
              status: "APPROVED",
              warehouseId: adjustment.warehouseId,
              productId: detail.productId,
              quantity: detail.quantity,
              reference: adjustment.adjustmentNumber,
              reason: `Reversión por cancelación de ajuste: ${cancellationReason}`,
            });
          }
        }
      }

      return id;
    }).then(async (adjustmentId) => {
      const updatedAdjustment = await this.getById(adjustmentId);
      return {
        message: "Ajuste cancelado exitosamente. Inventario revertido.",
        data: updatedAdjustment,
      };
    });
  }
}

export const adjustmentsService = new AdjustmentsService();
