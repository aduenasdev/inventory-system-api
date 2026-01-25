import { db } from "../../db/connection";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { lotConsumptions } from "../../db/schema/lot_consumptions";
import { inventory } from "../../db/schema/inventory";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { eq, and, gt, asc, desc, sql } from "drizzle-orm";
import { ValidationError, NotFoundError } from "../../utils/errors";

export interface CreateLotData {
  productId: number;
  warehouseId: number;
  quantity: number;
  originalCurrencyId: number;
  originalUnitCost: number;
  exchangeRate: number;
  unitCostBase?: number; // Costo ya convertido a CUP (opcional, si no se pasa se calcula)
  sourceType: "PURCHASE" | "TRANSFER" | "ADJUSTMENT" | "MIGRATION";
  sourceId?: number;
  sourceLotId?: number;
  entryDate: string;
}

export interface ConsumeLotResult {
  consumptions: Array<{
    lotId: number;
    lotCode: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
  totalCost: number;
}

export class LotService {
  /**
   * Genera código único para el lote
   */
  private async generateLotCode(
    sourceType: string,
    sourceId?: number,
    lineNumber?: number
  ): Promise<string> {
    const timestamp = Date.now();
    const prefix = sourceType.substring(0, 3).toUpperCase();
    
    if (sourceId && lineNumber !== undefined) {
      return `LOT-${prefix}-${sourceId}-${lineNumber}`;
    }
    
    return `LOT-${prefix}-${timestamp}`;
  }

  /**
   * Crea un nuevo lote de inventario
   * @param tx - Transacción opcional para garantizar atomicidad
   */
  async createLot(data: CreateLotData, lineNumber?: number, tx?: any): Promise<number> {
    const database = tx || db;
    const lotCode = await this.generateLotCode(data.sourceType, data.sourceId, lineNumber);
    
    // Usar costo base ya calculado si viene, o calcularlo
    const unitCostBase = data.unitCostBase ?? (data.originalUnitCost * data.exchangeRate);

    const [result] = (await database.insert(inventoryLots).values({
      lotCode,
      productId: data.productId,
      warehouseId: data.warehouseId,
      initialQuantity: data.quantity.toString(),
      currentQuantity: data.quantity.toString(),
      unitCostBase: unitCostBase.toString(),
      originalCurrencyId: data.originalCurrencyId,
      originalUnitCost: data.originalUnitCost.toString(),
      exchangeRate: data.exchangeRate.toString(),
      sourceType: data.sourceType,
      sourceId: data.sourceId || null,
      sourceLotId: data.sourceLotId || null,
      entryDate: new Date(data.entryDate),
      status: "ACTIVE",
    })) as any;

    // Actualizar caché de inventario (en la misma transacción si existe)
    await this.updateInventoryCache(data.warehouseId, data.productId, data.quantity, database);

    return result.insertId;
  }

  /**
   * Consume cantidad de lotes usando FIFO estricto
   * Retorna el detalle de consumo por lote y el costo total real
   * @param tx - Transacción opcional para garantizar atomicidad
   */
  async consumeLotsFromWarehouse(
    warehouseId: number,
    productId: number,
    quantity: number,
    consumptionType: "SALE" | "TRANSFER" | "ADJUSTMENT" | "CANCELLATION",
    referenceType: string,
    referenceId: number | null,
    tx?: any
  ): Promise<ConsumeLotResult> {
    const database = tx || db;
    
    // Obtener lotes disponibles en orden FIFO (con lock si estamos en transacción)
    let query = database
      .select()
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.productId, productId),
          eq(inventoryLots.warehouseId, warehouseId),
          eq(inventoryLots.status, "ACTIVE"),
          gt(inventoryLots.currentQuantity, "0")
        )
      )
      .orderBy(asc(inventoryLots.entryDate), asc(inventoryLots.id));
    
    // Agregar FOR UPDATE si estamos en transacción para evitar race conditions
    if (tx) {
      query = query.for("update");
    }
    
    const availableLots = await query;

    // Calcular stock total disponible
    const totalAvailable = availableLots.reduce(
      (sum: number, lot: { currentQuantity: string }) => sum + parseFloat(lot.currentQuantity),
      0
    );

    if (totalAvailable < quantity) {
      const [product] = await database
        .select()
        .from(products)
        .where(eq(products.id, productId));
      throw new ValidationError(
        `Stock insuficiente para "${product?.name || productId}". ` +
        `Disponible: ${totalAvailable.toFixed(2)}, Solicitado: ${quantity}`
      );
    }

    const consumptions: ConsumeLotResult["consumptions"] = [];
    let remainingQuantity = quantity;
    let totalCost = 0;

    for (const lot of availableLots) {
      if (remainingQuantity <= 0) break;

      const lotQty = parseFloat(lot.currentQuantity);
      const toConsume = Math.min(lotQty, remainingQuantity);
      const unitCost = parseFloat(lot.unitCostBase);
      const consumptionCost = toConsume * unitCost;

      // Registrar consumo
      await database.insert(lotConsumptions).values({
        lotId: lot.id,
        consumptionType,
        referenceType,
        referenceId,
        quantity: toConsume.toString(),
        unitCostAtConsumption: unitCost.toString(),
        totalCost: consumptionCost.toString(),
      });

      // Actualizar cantidad del lote
      const newQuantity = lotQty - toConsume;
      await database
        .update(inventoryLots)
        .set({
          currentQuantity: newQuantity.toString(),
          status: newQuantity <= 0 ? "EXHAUSTED" : "ACTIVE",
        })
        .where(eq(inventoryLots.id, lot.id));

      consumptions.push({
        lotId: lot.id,
        lotCode: lot.lotCode,
        quantity: toConsume,
        unitCost,
        totalCost: consumptionCost,
      });

      totalCost += consumptionCost;
      remainingQuantity -= toConsume;
    }

    // Actualizar caché de inventario (en la misma transacción)
    await this.updateInventoryCache(warehouseId, productId, -quantity, database);

    return { consumptions, totalCost };
  }

  /**
   * Obtener lotes activos de un producto en un almacén
   */
  async getActiveLotsByProductAndWarehouse(productId: number, warehouseId: number) {
    return await db
      .select({
        id: inventoryLots.id,
        lotCode: inventoryLots.lotCode,
        initialQuantity: inventoryLots.initialQuantity,
        currentQuantity: inventoryLots.currentQuantity,
        unitCostBase: inventoryLots.unitCostBase,
        originalCurrencyId: inventoryLots.originalCurrencyId,
        originalUnitCost: inventoryLots.originalUnitCost,
        exchangeRate: inventoryLots.exchangeRate,
        sourceType: inventoryLots.sourceType,
        sourceId: inventoryLots.sourceId,
        entryDate: inventoryLots.entryDate,
        status: inventoryLots.status,
        createdAt: inventoryLots.createdAt,
      })
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.productId, productId),
          eq(inventoryLots.warehouseId, warehouseId),
          eq(inventoryLots.status, "ACTIVE")
        )
      )
      .orderBy(asc(inventoryLots.entryDate), asc(inventoryLots.id));
  }

  /**
   * Obtener todos los lotes de un almacén
   */
  async getLotsByWarehouse(warehouseId: number, includeExhausted = false) {
    const conditions = [eq(inventoryLots.warehouseId, warehouseId)];
    
    if (!includeExhausted) {
      conditions.push(eq(inventoryLots.status, "ACTIVE"));
    }

    return await db
      .select({
        id: inventoryLots.id,
        lotCode: inventoryLots.lotCode,
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        initialQuantity: inventoryLots.initialQuantity,
        currentQuantity: inventoryLots.currentQuantity,
        unitCostBase: inventoryLots.unitCostBase,
        originalUnitCost: inventoryLots.originalUnitCost,
        currencyCode: currencies.code,
        exchangeRate: inventoryLots.exchangeRate,
        sourceType: inventoryLots.sourceType,
        entryDate: inventoryLots.entryDate,
        status: inventoryLots.status,
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .innerJoin(currencies, eq(inventoryLots.originalCurrencyId, currencies.id))
      .where(and(...conditions))
      .orderBy(asc(inventoryLots.entryDate), asc(inventoryLots.id));
  }

  /**
   * Obtener un lote por ID con toda su información
   */
  async getLotById(lotId: number) {
    const [lot] = await db
      .select({
        id: inventoryLots.id,
        lotCode: inventoryLots.lotCode,
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        warehouseId: inventoryLots.warehouseId,
        warehouseName: warehouses.name,
        initialQuantity: inventoryLots.initialQuantity,
        currentQuantity: inventoryLots.currentQuantity,
        unitCostBase: inventoryLots.unitCostBase,
        originalCurrencyId: inventoryLots.originalCurrencyId,
        currencyCode: currencies.code,
        originalUnitCost: inventoryLots.originalUnitCost,
        exchangeRate: inventoryLots.exchangeRate,
        sourceType: inventoryLots.sourceType,
        sourceId: inventoryLots.sourceId,
        sourceLotId: inventoryLots.sourceLotId,
        entryDate: inventoryLots.entryDate,
        status: inventoryLots.status,
        createdAt: inventoryLots.createdAt,
        updatedAt: inventoryLots.updatedAt,
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .innerJoin(warehouses, eq(inventoryLots.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(inventoryLots.originalCurrencyId, currencies.id))
      .where(eq(inventoryLots.id, lotId));

    if (!lot) {
      throw new NotFoundError("Lote no encontrado");
    }

    return lot;
  }

  /**
   * Obtener kardex (historial de consumos) de un lote
   */
  async getLotKardex(lotId: number) {
    const lot = await this.getLotById(lotId);

    const consumptions = await db
      .select()
      .from(lotConsumptions)
      .where(eq(lotConsumptions.lotId, lotId))
      .orderBy(asc(lotConsumptions.createdAt));

    return {
      lot,
      consumptions,
      summary: {
        initialQuantity: parseFloat(lot.initialQuantity),
        consumed: consumptions.reduce(
          (sum, c) => sum + parseFloat(c.quantity),
          0
        ),
        remaining: parseFloat(lot.currentQuantity),
      },
    };
  }

  /**
   * Obtener consumos de lotes para una venta específica
   */
  async getConsumptionsBySale(saleId: number) {
    return await db
      .select({
        consumptionId: lotConsumptions.id,
        lotId: lotConsumptions.lotId,
        lotCode: inventoryLots.lotCode,
        productId: inventoryLots.productId,
        productName: products.name,
        quantity: lotConsumptions.quantity,
        unitCost: lotConsumptions.unitCostAtConsumption,
        totalCost: lotConsumptions.totalCost,
        createdAt: lotConsumptions.createdAt,
      })
      .from(lotConsumptions)
      .innerJoin(inventoryLots, eq(lotConsumptions.lotId, inventoryLots.id))
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .where(
        and(
          eq(lotConsumptions.referenceType, "sales_detail"),
          eq(lotConsumptions.consumptionType, "SALE")
        )
      )
      .orderBy(asc(lotConsumptions.createdAt));
  }

  /**
   * Obtener el último costo conocido de un producto
   */
  async getLastKnownCost(productId: number): Promise<{
    unitCostBase: number;
    originalUnitCost: number;
    originalCurrencyId: number;
    exchangeRate: number;
  } | null> {
    const [lastLot] = await db
      .select({
        unitCostBase: inventoryLots.unitCostBase,
        originalUnitCost: inventoryLots.originalUnitCost,
        originalCurrencyId: inventoryLots.originalCurrencyId,
        exchangeRate: inventoryLots.exchangeRate,
      })
      .from(inventoryLots)
      .where(eq(inventoryLots.productId, productId))
      .orderBy(desc(inventoryLots.createdAt))
      .limit(1);

    if (!lastLot) {
      return null;
    }

    return {
      unitCostBase: parseFloat(lastLot.unitCostBase),
      originalUnitCost: parseFloat(lastLot.originalUnitCost),
      originalCurrencyId: lastLot.originalCurrencyId,
      exchangeRate: parseFloat(lastLot.exchangeRate),
    };
  }

  /**
   * Verificar si un lote tiene consumos (para bloquear cancelaciones)
   */
  async hasConsumptions(lotId: number): Promise<boolean> {
    const consumptions = await db
      .select({ id: lotConsumptions.id })
      .from(lotConsumptions)
      .where(eq(lotConsumptions.lotId, lotId))
      .limit(1);

    return consumptions.length > 0;
  }

  /**
   * Obtener lotes de una compra
   */
  async getLotsByPurchase(purchaseId: number) {
    return await db
      .select()
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.sourceType, "PURCHASE"),
          eq(inventoryLots.sourceId, purchaseId)
        )
      );
  }

  /**
   * Mover lote completo a otro almacén (traslado completo)
   * @param tx - Transacción opcional para garantizar atomicidad
   */
  async moveLotToWarehouse(lotId: number, destinationWarehouseId: number, tx?: any): Promise<void> {
    const database = tx || db;
    const lot = await this.getLotById(lotId);
    const quantity = parseFloat(lot.currentQuantity);

    // Actualizar caché del almacén origen (restar)
    await this.updateInventoryCache(lot.warehouseId, lot.productId, -quantity, database);

    // Mover el lote
    await database
      .update(inventoryLots)
      .set({ warehouseId: destinationWarehouseId })
      .where(eq(inventoryLots.id, lotId));

    // Actualizar caché del almacén destino (sumar)
    await this.updateInventoryCache(destinationWarehouseId, lot.productId, quantity, database);
  }

  /**
   * Actualiza el caché de inventario (tabla inventory)
   * Usa FOR UPDATE para evitar race conditions
   * @param database - Conexión o transacción a usar
   */
  async updateInventoryCache(
    warehouseId: number,
    productId: number,
    quantityChange: number,
    database?: any
  ): Promise<void> {
    const conn = database || db;
    
    // Usar FOR UPDATE para bloquear el registro y evitar race conditions
    let query = conn
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.warehouseId, warehouseId),
          eq(inventory.productId, productId)
        )
      );
    
    // Solo agregar FOR UPDATE si estamos en una transacción
    if (database) {
      query = query.for("update");
    }
    
    const [existingStock] = await query;

    if (existingStock) {
      const newQuantity = parseFloat(existingStock.currentQuantity) + quantityChange;
      await conn
        .update(inventory)
        .set({ currentQuantity: newQuantity.toString() })
        .where(eq(inventory.id, existingStock.id));
    } else {
      await conn.insert(inventory).values({
        warehouseId,
        productId,
        currentQuantity: quantityChange.toString(),
      });
    }
  }

  /**
   * Obtener stock total de un producto en un almacén (suma de lotes activos)
   */
  async getStockFromLots(warehouseId: number, productId: number): Promise<number> {
    const lots = await db
      .select({ currentQuantity: inventoryLots.currentQuantity })
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.warehouseId, warehouseId),
          eq(inventoryLots.productId, productId),
          eq(inventoryLots.status, "ACTIVE")
        )
      );

    return lots.reduce((sum, lot) => sum + parseFloat(lot.currentQuantity), 0);
  }
}

export const lotService = new LotService();
