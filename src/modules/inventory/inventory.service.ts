import { db } from "../../db/connection";
import { inventory } from "../../db/schema/inventory";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { currencies } from "../../db/schema/currencies";
import { users } from "../../db/schema/users";
import { eq, and, sql, desc, gte, lte, inArray } from "drizzle-orm";
import { ForbiddenError } from "../../utils/errors";

export class InventoryService {
  // Obtener stock actual de un producto en un almacén
  async getStockByWarehouseAndProduct(warehouseId: number, productId: number) {
    const [stock] = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.warehouseId, warehouseId),
          eq(inventory.productId, productId)
        )
      );

    if (!stock) {
      return { warehouseId, productId, currentQuantity: "0" };
    }

    return stock;
  }

  // Obtener stock completo de un almacén
  async getStockByWarehouse(warehouseId: number) {
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
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .where(eq(inventoryMovements.productId, productId))
      .orderBy(desc(inventoryMovements.createdAt));

    return movements;
  }

  // Crear ajuste de inventario (siempre APPROVED)
  async createAdjustment(data: {
    type: "ADJUSTMENT_ENTRY" | "ADJUSTMENT_EXIT";
    warehouseId: number;
    productId: number;
    quantity: number;
    reason: string;
    userId: number;
  }) {
    // Crear movimiento APPROVED
    const [movement] = (await db.insert(inventoryMovements).values({
      type: data.type,
      status: "APPROVED",
      warehouseId: data.warehouseId,
      productId: data.productId,
      quantity: data.quantity.toString(),
      reference: `ADJ-${Date.now()}`,
      reason: data.reason,
    })) as any;

    // Actualizar inventario inmediatamente
    await this.updateInventory(
      data.warehouseId,
      data.productId,
      data.type === "ADJUSTMENT_ENTRY" ? data.quantity : -data.quantity
    );

    return movement;
  }

  // Actualizar inventario (método interno)
  private async updateInventory(
    warehouseId: number,
    productId: number,
    quantityChange: number
  ) {
    // Buscar registro de inventario
    const [existingStock] = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.warehouseId, warehouseId),
          eq(inventory.productId, productId)
        )
      );

    if (existingStock) {
      // Actualizar stock existente
      const newQuantity =
        parseFloat(existingStock.currentQuantity) + quantityChange;

      await db
        .update(inventory)
        .set({
          currentQuantity: newQuantity.toString(),
        })
        .where(eq(inventory.id, existingStock.id));
    } else {
      // Crear nuevo registro de inventario
      await db.insert(inventory).values({
        warehouseId,
        productId,
        currentQuantity: quantityChange.toString(),
      });
    }
  }

  // Verificar si hay stock suficiente
  async checkStock(warehouseId: number, productId: number, quantity: number) {
    const stock = await this.getStockByWarehouseAndProduct(
      warehouseId,
      productId
    );
    const currentQty = parseFloat(stock.currentQuantity);
    return currentQty >= quantity;
  }

  // Reporte de inventario valorizado
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
        overall: { byCurrency: [], totalProducts: 0 },
      };
    }

    // Obtener inventario con productos y sus precios
    const inventoryData = await db
      .select({
        warehouseId: inventory.warehouseId,
        warehouseName: warehouses.name,
        productId: inventory.productId,
        productName: products.name,
        productCode: products.code,
        quantity: inventory.currentQuantity,
        costPrice: products.costPrice,
        salePrice: products.salePrice,
        currencyId: products.currencyId,
        currencyCode: currencies.code,
        currencyName: currencies.name,
      })
      .from(inventory)
      .innerJoin(warehouses, eq(inventory.warehouseId, warehouses.id))
      .innerJoin(products, eq(inventory.productId, products.id))
      .innerJoin(currencies, eq(products.currencyId, currencies.id))
      .where(inArray(inventory.warehouseId, allowedWarehouseIds));

    // Agrupar por almacén
    const byWarehouse: any[] = [];
    const warehouseMap = new Map<number, any>();

    for (const item of inventoryData) {
      if (!warehouseMap.has(item.warehouseId)) {
        warehouseMap.set(item.warehouseId, {
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          products: [],
          byCurrency: new Map<string, { currency: string; code: string; totalCost: number; totalSale: number; productCount: number }>(),
        });
      }

      const warehouse = warehouseMap.get(item.warehouseId);
      
      const quantity = parseFloat(item.quantity);
      const costPrice = parseFloat(item.costPrice || "0");
      const salePrice = parseFloat(item.salePrice || "0");
      const totalCost = quantity * costPrice;
      const totalSale = quantity * salePrice;

      warehouse.products.push({
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode,
        quantity: item.quantity,
        costPrice: item.costPrice,
        salePrice: item.salePrice,
        currency: item.currencyCode,
        totalCost: totalCost.toFixed(2),
        totalSale: totalSale.toFixed(2),
      });

      // Acumular por moneda
      const currencyKey = item.currencyCode;
      if (!warehouse.byCurrency.has(currencyKey)) {
        warehouse.byCurrency.set(currencyKey, {
          currency: item.currencyName,
          code: item.currencyCode,
          totalCost: 0,
          totalSale: 0,
          productCount: 0,
        });
      }
      
      const currencyData = warehouse.byCurrency.get(currencyKey);
      currencyData.totalCost += totalCost;
      currencyData.totalSale += totalSale;
      currencyData.productCount++;
    }

    // Construir resultado por almacén
    for (const [_, warehouse] of warehouseMap) {
      byWarehouse.push({
        warehouseId: warehouse.warehouseId,
        warehouseName: warehouse.warehouseName,
        productCount: warehouse.products.length,
        products: warehouse.products,
        byCurrency: Array.from(warehouse.byCurrency.values()).map((c: any) => ({
          currency: c.currency,
          code: c.code,
          totalCost: c.totalCost.toFixed(2),
          totalSale: c.totalSale.toFixed(2),
          productCount: c.productCount,
        })),
      });
    }

    // Calcular totales generales
    const overallByCurrency = new Map<string, { currency: string; code: string; totalCost: number; totalSale: number; productCount: number }>();
    let totalProducts = 0;

    for (const warehouse of byWarehouse) {
      totalProducts += warehouse.productCount;
      for (const curr of warehouse.byCurrency) {
        if (!overallByCurrency.has(curr.code)) {
          overallByCurrency.set(curr.code, {
            currency: curr.currency,
            code: curr.code,
            totalCost: 0,
            totalSale: 0,
            productCount: 0,
          });
        }
        const overall = overallByCurrency.get(curr.code)!;
        overall.totalCost += parseFloat(curr.totalCost);
        overall.totalSale += parseFloat(curr.totalSale);
        overall.productCount += curr.productCount;
      }
    }

    return {
      byWarehouse,
      overall: {
        totalProducts,
        byCurrency: Array.from(overallByCurrency.values()).map((c) => ({
          currency: c.currency,
          code: c.code,
          totalCost: c.totalCost.toFixed(2),
          totalSale: c.totalSale.toFixed(2),
          productCount: c.productCount,
        })),
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
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .where(and(...conditions))
      .orderBy(desc(inventoryMovements.createdAt));

    return adjustments;
  }
}
