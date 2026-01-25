import { db } from "../../db/connection";
import { inventory } from "../../db/schema/inventory";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { currencies } from "../../db/schema/currencies";
import { eq, and, sql, desc, gte, lte, inArray, gt, asc } from "drizzle-orm";
import { ForbiddenError, ValidationError } from "../../utils/errors";
import { lotService } from "./lots.service";
import { getTodayDateString, normalizeBusinessDate } from "../../utils/date";

export class InventoryService {
  // Obtener stock actual de un producto en un almacén (desde cache o lotes)
  async getStockByWarehouseAndProduct(warehouseId: number, productId: number) {
    // Calcular desde lotes activos (fuente de verdad)
    const stockFromLots = await lotService.getStockFromLots(warehouseId, productId);

    return {
      warehouseId,
      productId,
      currentQuantity: stockFromLots.toFixed(2),
    };
  }

  // Obtener stock completo de un almacén (desde cache, sincronizado con lotes)
  async getStockByWarehouse(warehouseId: number) {
    // Obtener desde cache
    const stocks = await db
      .select({
        id: inventory.id,
        warehouseId: inventory.warehouseId,
        productId: inventory.productId,
        productName: products.name,
        productCode: products.code,
        currentQuantity: inventory.currentQuantity,
        updatedAt: inventory.updatedAt,
      })
      .from(inventory)
      .innerJoin(products, eq(inventory.productId, products.id))
      .where(eq(inventory.warehouseId, warehouseId));

    return stocks;
  }

  // Obtener kardex (historial) de un producto
  async getProductKardex(productId: number) {
    const movements = await db
      .select({
        id: inventoryMovements.id,
        type: inventoryMovements.type,
        status: inventoryMovements.status,
        warehouseId: inventoryMovements.warehouseId,
        warehouseName: warehouses.name,
        quantity: inventoryMovements.quantity,
        reference: inventoryMovements.reference,
        reason: inventoryMovements.reason,
        lotId: inventoryMovements.lotId,
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .where(eq(inventoryMovements.productId, productId))
      .orderBy(desc(inventoryMovements.createdAt));

    // Enriquecer con información del lote si existe
    const movementsWithLot = await Promise.all(
      movements.map(async (m) => {
        if (m.lotId) {
          const [lot] = await db
            .select({ lotCode: inventoryLots.lotCode })
            .from(inventoryLots)
            .where(eq(inventoryLots.id, m.lotId));
          return { ...m, lotCode: lot?.lotCode || null };
        }
        return { ...m, lotCode: null };
      })
    );

    return movementsWithLot;
  }

  // Crear ajuste de inventario (con lógica de lotes y transacción)
  async createAdjustment(data: {
    type: "ADJUSTMENT_ENTRY" | "ADJUSTMENT_EXIT";
    warehouseId: number;
    productId: number;
    quantity: number;
    reason: string;
    userId: number;
    currencyId?: number; // Solo para entradas
    unitCost?: number; // Solo para entradas
    exchangeRate?: number; // Solo para entradas
  }) {
    // Validar cantidad mayor a 0
    if (data.quantity <= 0) {
      throw new ValidationError("La cantidad debe ser mayor a 0");
    }

    const reference = `ADJ-${Date.now()}`;

    if (data.type === "ADJUSTMENT_ENTRY") {
      // Para entradas, crear un nuevo lote
      let originalCurrencyId = data.currencyId;
      let originalUnitCost = data.unitCost;
      let exchangeRate = data.exchangeRate || 1;

      // Si no se especifica costo, usar el último lote conocido o producto
      if (!originalUnitCost) {
        const lastCost = await lotService.getLastKnownCost(data.productId);
        if (lastCost) {
          originalCurrencyId = lastCost.originalCurrencyId;
          originalUnitCost = lastCost.originalUnitCost;
          exchangeRate = lastCost.exchangeRate;
        }
      }

      if (!originalCurrencyId || !originalUnitCost) {
        throw new ValidationError(
          "Debe especificar el costo y la moneda para ajustes de entrada, o el producto debe tener un costo definido"
        );
      }

      // Ejecutar en transacción para atomicidad
      return await db.transaction(async (tx) => {
        // Crear lote para el ajuste de entrada (pasando tx)
        const lotId = await lotService.createLot({
          productId: data.productId,
          warehouseId: data.warehouseId,
          quantity: data.quantity,
          originalCurrencyId,
          originalUnitCost,
          exchangeRate,
          sourceType: "ADJUSTMENT",
          sourceId: undefined,
          sourceLotId: undefined,
          entryDate: getTodayDateString(),
        }, undefined, tx);

        // Registrar movimiento
        await tx.insert(inventoryMovements).values({
          type: data.type,
          status: "APPROVED",
          warehouseId: data.warehouseId,
          productId: data.productId,
          quantity: data.quantity.toString(),
          reference,
          reason: data.reason,
          lotId,
        });

        return {
          message: "Ajuste de entrada creado exitosamente",
          lotId,
          reference,
        };
      });
    } else {
      // Para salidas, consumir lotes FIFO
      const availableStock = await lotService.getStockFromLots(
        data.warehouseId,
        data.productId
      );

      if (availableStock < data.quantity) {
        throw new ValidationError(
          `Stock insuficiente. Disponible: ${availableStock.toFixed(2)}, Solicitado: ${data.quantity}`
        );
      }

      // Ejecutar en transacción para atomicidad
      return await db.transaction(async (tx) => {
        // Consumir lotes FIFO (pasando tx)
        const consumeResult = await lotService.consumeLotsFromWarehouse(
          data.warehouseId,
          data.productId,
          data.quantity,
          "ADJUSTMENT",
          "inventory_movements",
          null,
          tx
        );

        // Registrar movimiento por cada consumo
        for (const consumption of consumeResult.consumptions) {
          await tx.insert(inventoryMovements).values({
            type: data.type,
            status: "APPROVED",
            warehouseId: data.warehouseId,
            productId: data.productId,
            quantity: consumption.quantity.toString(),
            reference,
            reason: `${data.reason} (Lote: ${consumption.lotCode})`,
            lotId: consumption.lotId,
          });
        }

        return {
          message: "Ajuste de salida creado exitosamente",
          reference,
          consumedLots: consumeResult.consumptions.length,
          totalCost: consumeResult.totalCost,
        };
      });
    }
  }

  // Verificar si hay stock suficiente (desde lotes)
  async checkStock(warehouseId: number, productId: number, quantity: number) {
    const stockFromLots = await lotService.getStockFromLots(warehouseId, productId);
    return stockFromLots >= quantity;
  }

  // Obtener lotes activos de un producto en un almacén
  async getActiveLots(warehouseId: number, productId: number) {
    return await lotService.getActiveLotsByProductAndWarehouse(
      productId,
      warehouseId
    );
  }

  // Obtener todos los lotes de un almacén
  async getLotsByWarehouse(warehouseId: number) {
    return await lotService.getLotsByWarehouse(warehouseId);
  }

  // Obtener kardex de un lote específico
  async getLotKardex(lotId: number) {
    return await lotService.getLotKardex(lotId);
  }

  // Reporte de inventario valorizado (usando lotes para cálculo de costo)
  async getInventoryValueReport(userId: number, warehouseId?: number) {
    // Obtener almacenes del usuario
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    let allowedWarehouseIds = userWarehousesData.map((w) => w.warehouseId);

    // Si se especifica un almacén, validar que el usuario tenga acceso
    if (warehouseId) {
      if (!allowedWarehouseIds.includes(warehouseId)) {
        throw new ForbiddenError("No tiene acceso a este almacén");
      }
      allowedWarehouseIds = [warehouseId];
    }

    if (allowedWarehouseIds.length === 0) {
      return {
        byWarehouse: [],
        overall: { byCurrency: [], totalProducts: 0, totalCostCUP: "0.00" },
      };
    }

    // Obtener lotes activos con stock
    const activeLots = await db
      .select({
        warehouseId: inventoryLots.warehouseId,
        warehouseName: warehouses.name,
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        lotCode: inventoryLots.lotCode,
        currentQuantity: inventoryLots.currentQuantity,
        unitCostBase: inventoryLots.unitCostBase,
        originalUnitCost: inventoryLots.originalUnitCost,
        originalCurrencyId: inventoryLots.originalCurrencyId,
        currencyCode: currencies.code,
        currencyName: currencies.name,
        entryDate: inventoryLots.entryDate,
      })
      .from(inventoryLots)
      .innerJoin(warehouses, eq(inventoryLots.warehouseId, warehouses.id))
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .innerJoin(currencies, eq(inventoryLots.originalCurrencyId, currencies.id))
      .where(
        and(
          inArray(inventoryLots.warehouseId, allowedWarehouseIds),
          eq(inventoryLots.status, "ACTIVE"),
          gt(inventoryLots.currentQuantity, "0")
        )
      )
      .orderBy(asc(inventoryLots.entryDate));

    // Agrupar por almacén
    const byWarehouse: any[] = [];
    const warehouseMap = new Map<number, any>();

    for (const lot of activeLots) {
      if (!warehouseMap.has(lot.warehouseId)) {
        warehouseMap.set(lot.warehouseId, {
          warehouseId: lot.warehouseId,
          warehouseName: lot.warehouseName,
          lots: [],
          products: new Map<number, any>(),
          totalCostCUP: 0,
        });
      }

      const warehouse = warehouseMap.get(lot.warehouseId);

      const quantity = parseFloat(lot.currentQuantity);
      const unitCostBase = parseFloat(lot.unitCostBase); // En CUP
      const totalCostCUP = quantity * unitCostBase;

      warehouse.lots.push({
        lotCode: lot.lotCode,
        productId: lot.productId,
        productName: lot.productName,
        productCode: lot.productCode,
        quantity: lot.currentQuantity,
        originalCurrency: lot.currencyCode,
        originalUnitCost: lot.originalUnitCost,
        unitCostCUP: lot.unitCostBase,
        totalCostCUP: totalCostCUP.toFixed(2),
        entryDate: lot.entryDate,
      });

      warehouse.totalCostCUP += totalCostCUP;

      // Acumular por producto
      if (!warehouse.products.has(lot.productId)) {
        warehouse.products.set(lot.productId, {
          productId: lot.productId,
          productName: lot.productName,
          productCode: lot.productCode,
          totalQuantity: 0,
          totalCostCUP: 0,
          lotCount: 0,
        });
      }
      const prodData = warehouse.products.get(lot.productId);
      prodData.totalQuantity += quantity;
      prodData.totalCostCUP += totalCostCUP;
      prodData.lotCount++;
    }

    // Construir resultado por almacén
    let overallTotalCostCUP = 0;
    let overallTotalProducts = 0;

    for (const [_, warehouse] of warehouseMap) {
      const productsArray = Array.from(warehouse.products.values()).map((p: any) => ({
        productId: p.productId,
        productName: p.productName,
        productCode: p.productCode,
        totalQuantity: p.totalQuantity.toFixed(2),
        totalCostCUP: p.totalCostCUP.toFixed(2),
        averageCostCUP: (p.totalCostCUP / p.totalQuantity).toFixed(2),
        lotCount: p.lotCount,
      }));

      byWarehouse.push({
        warehouseId: warehouse.warehouseId,
        warehouseName: warehouse.warehouseName,
        productCount: warehouse.products.size,
        lotCount: warehouse.lots.length,
        totalCostCUP: warehouse.totalCostCUP.toFixed(2),
        products: productsArray,
        lots: warehouse.lots,
      });

      overallTotalCostCUP += warehouse.totalCostCUP;
      overallTotalProducts += warehouse.products.size;
    }

    return {
      byWarehouse,
      overall: {
        totalProducts: overallTotalProducts,
        totalCostCUP: overallTotalCostCUP.toFixed(2),
        baseCurrency: "CUP",
      },
    };
  }

  // Reporte de ajustes de inventario
  async getAdjustmentsReport(
    userId: number,
    startDate?: string,
    endDate?: string,
    warehouseId?: number
  ) {
    // Obtener almacenes del usuario
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    let allowedWarehouseIds = userWarehousesData.map((w) => w.warehouseId);

    if (warehouseId) {
      if (!allowedWarehouseIds.includes(warehouseId)) {
        throw new ForbiddenError("No tiene acceso a este almacén");
      }
      allowedWarehouseIds = [warehouseId];
    }

    if (allowedWarehouseIds.length === 0) {
      return [];
    }

    // Construir condiciones
    const conditions: any[] = [
      inArray(inventoryMovements.warehouseId, allowedWarehouseIds),
      sql`${inventoryMovements.type} IN ('ADJUSTMENT_ENTRY', 'ADJUSTMENT_EXIT')`,
    ];

    if (startDate) {
      conditions.push(gte(inventoryMovements.createdAt, sql`${startDate}`));
    }

    if (endDate) {
      conditions.push(lte(inventoryMovements.createdAt, sql`${endDate}`));
    }

    // Obtener ajustes
    const adjustments = await db
      .select({
        id: inventoryMovements.id,
        type: inventoryMovements.type,
        status: inventoryMovements.status,
        warehouseId: inventoryMovements.warehouseId,
        warehouseName: warehouses.name,
        productId: inventoryMovements.productId,
        productName: products.name,
        productCode: products.code,
        quantity: inventoryMovements.quantity,
        reference: inventoryMovements.reference,
        reason: inventoryMovements.reason,
        lotId: inventoryMovements.lotId,
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .where(and(...conditions))
      .orderBy(desc(inventoryMovements.createdAt));

    // Enriquecer con info del lote
    const adjustmentsWithLot = await Promise.all(
      adjustments.map(async (adj) => {
        if (adj.lotId) {
          const [lot] = await db
            .select({
              lotCode: inventoryLots.lotCode,
              unitCostBase: inventoryLots.unitCostBase,
            })
            .from(inventoryLots)
            .where(eq(inventoryLots.id, adj.lotId));
          return {
            ...adj,
            lotCode: lot?.lotCode || null,
            unitCostCUP: lot?.unitCostBase || null,
          };
        }
        return { ...adj, lotCode: null, unitCostCUP: null };
      })
    );

    return adjustmentsWithLot;
  }
}
