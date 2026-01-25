import { db } from "../../db/connection";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { categories } from "../../db/schema/categories";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { eq, and, sql, desc, gte, lte, inArray, like } from "drizzle-orm";
import { ForbiddenError, NotFoundError } from "../../utils/errors";

const BASE_CURRENCY_ID = 1;

export class ReportsService {
  // Obtener almacenes asignados al usuario
  private async getUserWarehouses(userId: number): Promise<number[]> {
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    return userWarehousesData.map((w) => w.warehouseId);
  }

  // Validar que el usuario puede acceder a un almacén
  private async validateWarehouseAccess(userId: number, warehouseId: number): Promise<void> {
    const allowedWarehouses = await this.getUserWarehouses(userId);
    if (!allowedWarehouses.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este almacén");
    }
  }

  // ========== REPORTE 1: STOCK ACTUAL ==========
  async getStockReport(
    userId: number,
    warehouseId?: number,
    productId?: number,
    categoryId?: number
  ) {
    // Obtener almacenes permitidos
    const allowedWarehouses = await this.getUserWarehouses(userId);
    if (allowedWarehouses.length === 0) {
      return { warehouses: [], summary: { totalProducts: 0, totalStock: "0.00" } };
    }

    // Validar acceso si especifica almacén
    if (warehouseId && !allowedWarehouses.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este almacén");
    }

    const conditions: any[] = [eq(inventoryLots.status, "ACTIVE")];

    // Filtrar por almacén(es)
    if (warehouseId) {
      conditions.push(eq(inventoryLots.warehouseId, warehouseId));
    } else {
      conditions.push(inArray(inventoryLots.warehouseId, allowedWarehouses));
    }

    // Filtrar por producto
    if (productId) {
      conditions.push(eq(inventoryLots.productId, productId));
    }

    // Filtrar por categoría (si especifica)
    if (categoryId) {
      // Necesitamos hacer JOIN con products y categories
      const lotsData = await db
        .select({
          warehouseId: inventoryLots.warehouseId,
          productId: inventoryLots.productId,
          productName: products.name,
          productCode: products.code,
          warehouseName: warehouses.name,
          quantity: sql<string>`SUM(${inventoryLots.currentQuantity})`.as('total_quantity'),
        })
        .from(inventoryLots)
        .innerJoin(products, eq(inventoryLots.productId, products.id))
        .innerJoin(warehouses, eq(inventoryLots.warehouseId, warehouses.id))
        .where(and(...conditions, eq(products.categoryId, categoryId)))
        .groupBy(inventoryLots.warehouseId, inventoryLots.productId, products.id, warehouses.id);

      const totalStock = lotsData.reduce((sum, lot) => sum + parseFloat(lot.quantity), 0);
      return {
        warehouses: lotsData.map((lot) => ({
          warehouseId: lot.warehouseId,
          warehouseName: lot.warehouseName,
          productId: lot.productId,
          productName: lot.productName,
          productCode: lot.productCode,
          quantity: lot.quantity,
        })),
        summary: { totalProducts: lotsData.length, totalStock: totalStock.toFixed(2) },
      };
    }

    // Sin filtro de categoría
    const lotsData = await db
      .select({
        warehouseId: inventoryLots.warehouseId,
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        warehouseName: warehouses.name,
        quantity: sql<string>`SUM(${inventoryLots.currentQuantity})`.as('total_quantity'),
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .innerJoin(warehouses, eq(inventoryLots.warehouseId, warehouses.id))
      .where(and(...conditions))
      .groupBy(inventoryLots.warehouseId, inventoryLots.productId, products.id, warehouses.id);

    const totalStock = lotsData.reduce((sum, lot) => sum + parseFloat(lot.quantity), 0);
    return {
      warehouses: lotsData.map((lot) => ({
        warehouseId: lot.warehouseId,
        warehouseName: lot.warehouseName,
        productId: lot.productId,
        productName: lot.productName,
        productCode: lot.productCode,
        quantity: lot.quantity,
      })),
      summary: { totalProducts: lotsData.length, totalStock: totalStock.toFixed(2) },
    };
  }

  // ========== REPORTE 2: STOCK VALORIZADO ==========
  async getValorizedStock(
    userId: number,
    warehouseId?: number,
    productId?: number,
    categoryId?: number
  ) {
    // Obtener almacenes permitidos
    const allowedWarehouses = await this.getUserWarehouses(userId);
    if (allowedWarehouses.length === 0) {
      return { warehouses: [], summary: { totalProducts: 0, totalValue: "0.00", totalStock: "0.00" } };
    }

    // Validar acceso si especifica almacén
    if (warehouseId && !allowedWarehouses.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este almacén");
    }

    const conditions: any[] = [eq(inventoryLots.status, "ACTIVE")];

    if (warehouseId) {
      conditions.push(eq(inventoryLots.warehouseId, warehouseId));
    } else {
      conditions.push(inArray(inventoryLots.warehouseId, allowedWarehouses));
    }

    if (productId) {
      conditions.push(eq(inventoryLots.productId, productId));
    }

    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    // Obtener todos los lotes con sus costos
    const lotsData = await db
      .select({
        warehouseId: inventoryLots.warehouseId,
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        warehouseName: warehouses.name,
        quantity: inventoryLots.currentQuantity,
        unitCostBase: inventoryLots.unitCostBase,
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .innerJoin(warehouses, eq(inventoryLots.warehouseId, warehouses.id))
      .where(and(...conditions));

    // Agrupar por warehouse + product y calcular totales
    const grouped: Record<string, any> = {};
    lotsData.forEach((lot) => {
      const key = `${lot.warehouseId}_${lot.productId}`;
      if (!grouped[key]) {
        grouped[key] = {
          warehouseId: lot.warehouseId,
          warehouseName: lot.warehouseName,
          productId: lot.productId,
          productName: lot.productName,
          productCode: lot.productCode,
          totalQuantity: 0,
          totalValue: 0,
        };
      }
      const qty = parseFloat(lot.quantity);
      const unitCost = parseFloat(lot.unitCostBase);
      grouped[key].totalQuantity += qty;
      grouped[key].totalValue += qty * unitCost;
    });

    const results = Object.values(grouped).map((item) => ({
      ...item,
      totalQuantity: item.totalQuantity.toFixed(2),
      totalValue: item.totalValue.toFixed(2),
    }));

    const totalValue = results.reduce((sum, item) => sum + parseFloat(item.totalValue), 0);
    const totalStock = results.reduce((sum, item) => sum + parseFloat(item.totalQuantity), 0);

    return {
      warehouses: results,
      summary: {
        totalProducts: results.length,
        totalValue: totalValue.toFixed(2),
        totalStock: totalStock.toFixed(2),
        currency: "CUP",
      },
    };
  }

  // ========== REPORTE 3: PRODUCTOS SIN STOCK / BAJO MÍNIMO ==========
  async getLowStock(userId: number, warehouseId?: number, minThreshold: number = 10) {
    // Obtener almacenes permitidos
    const allowedWarehouses = await this.getUserWarehouses(userId);
    if (allowedWarehouses.length === 0) {
      return { products: [], summary: { totalProducts: 0 } };
    }

    // Validar acceso si especifica almacén
    if (warehouseId && !allowedWarehouses.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este almacén");
    }

    // Obtener productos con stock bajo
    const lowStockLots = await db
      .select({
        warehouseId: inventoryLots.warehouseId,
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        warehouseName: warehouses.name,
        categoryName: categories.name,
        quantity: sql<string>`SUM(${inventoryLots.currentQuantity})`.as('total_quantity'),
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .innerJoin(warehouses, eq(inventoryLots.warehouseId, warehouses.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          warehouseId 
            ? eq(inventoryLots.warehouseId, warehouseId)
            : inArray(inventoryLots.warehouseId, allowedWarehouses),
          sql`${inventoryLots.currentQuantity} < ${minThreshold}` // Stock bajo
        )
      )
      .groupBy(inventoryLots.warehouseId, inventoryLots.productId, products.id, warehouses.id, categories.id);

    const allProducts = lowStockLots.map((lot) => ({
      ...lot,
      quantity: lot.quantity,
      status: "LOW_STOCK",
    }));

    return {
      products: allProducts,
      summary: { totalProducts: allProducts.length, threshold: minThreshold },
    };
  }

  // ========== REPORTE 4: MOVIMIENTOS ==========
  async getMovementsReport(
    userId: number,
    startDate: string,
    endDate: string,
    warehouseId?: number,
    type?: string,
    productId?: number
  ) {
    // Obtener almacenes permitidos
    const allowedWarehouses = await this.getUserWarehouses(userId);
    if (allowedWarehouses.length === 0) {
      return { movements: [], summary: { totalMovements: 0 } };
    }

    // Validar acceso si especifica almacén
    if (warehouseId && !allowedWarehouses.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este almacén");
    }

    const conditions: any[] = [
      gte(inventoryMovements.createdAt, sql`${startDate}`),
      lte(inventoryMovements.createdAt, sql`${endDate}`),
    ];

    if (warehouseId) {
      conditions.push(eq(inventoryMovements.warehouseId, warehouseId));
    } else {
      conditions.push(inArray(inventoryMovements.warehouseId, allowedWarehouses));
    }

    if (type) {
      conditions.push(eq(inventoryMovements.type, type as any));
    }

    if (productId) {
      conditions.push(eq(inventoryMovements.productId, productId));
    }

    const movements = await db
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

    return {
      movements,
      summary: {
        totalMovements: movements.length,
        startDate,
        endDate,
      },
    };
  }

  // ========== REPORTE 5: KARDEX ==========
  async getKardex(
    userId: number,
    productId: number,
    warehouseId?: number,
    startDate?: string,
    endDate?: string
  ) {
    // Validar que el producto exista
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId));

    if (!product) {
      throw new NotFoundError("Producto no encontrado");
    }

    // Obtener almacenes permitidos
    const allowedWarehouses = await this.getUserWarehouses(userId);
    if (allowedWarehouses.length === 0) {
      return { product: null, entries: [], summary: { totalQuantity: "0.00", totalValue: "0.00" } };
    }

    // Validar acceso si especifica almacén
    if (warehouseId && !allowedWarehouses.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este almacén");
    }

    const conditions: any[] = [eq(inventoryMovements.productId, productId)];

    if (warehouseId) {
      conditions.push(eq(inventoryMovements.warehouseId, warehouseId));
    } else {
      conditions.push(inArray(inventoryMovements.warehouseId, allowedWarehouses));
    }

    if (startDate && endDate) {
      conditions.push(gte(inventoryMovements.createdAt, sql`${startDate}`));
      conditions.push(lte(inventoryMovements.createdAt, sql`${endDate}`));
    }

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
        lotId: inventoryMovements.lotId,
      })
      .from(inventoryMovements)
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .where(and(...conditions))
      .orderBy(desc(inventoryMovements.createdAt));

    // Obtener lotes actuales para calcular costo total
    let totalValue = 0;
    let totalQuantity = 0;

    // Si no especifica fechas, calcular con lotes actuales
    if (!startDate && !endDate) {
      const currentLots = await db
        .select({
          quantity: inventoryLots.currentQuantity,
          unitCostBase: inventoryLots.unitCostBase,
        })
        .from(inventoryLots)
        .where(
          and(
            eq(inventoryLots.productId, productId),
            eq(inventoryLots.status, "ACTIVE"),
            warehouseId ? eq(inventoryLots.warehouseId, warehouseId) : inArray(inventoryLots.warehouseId, allowedWarehouses)
          )
        );

      currentLots.forEach((lot) => {
        const qty = parseFloat(lot.quantity);
        const cost = parseFloat(lot.unitCostBase);
        totalQuantity += qty;
        totalValue += qty * cost;
      });
    }

    return {
      product: {
        id: product.id,
        name: product.name,
        code: product.code,
        description: product.description,
      },
      entries: movements,
      summary: {
        totalQuantity: totalQuantity.toFixed(2),
        totalValue: totalValue.toFixed(2),
        totalMovements: movements.length,
        currency: "CUP",
      },
    };
  }
}
