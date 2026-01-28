import { db } from "../../db/connection";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { categories } from "../../db/schema/categories";
import { units } from "../../db/schema/units";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { sales } from "../../db/schema/sales";
import { salesDetail } from "../../db/schema/sales_detail";
import { expenses } from "../../db/schema/expenses";
import { expenseTypes } from "../../db/schema/expense_types";
import { purchases } from "../../db/schema/purchases";
import { purchasesDetail } from "../../db/schema/purchases_detail";
import { transfers } from "../../db/schema/transfers";
import { eq, and, sql, desc, gte, lte, inArray, like, asc, isNull } from "drizzle-orm";
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
  // Ahora usa el minStock configurado en cada producto
  async getLowStock(userId: number, warehouseId?: number, useProductMinStock: boolean = true) {
    // Obtener almacenes permitidos
    const allowedWarehouses = await this.getUserWarehouses(userId);
    if (allowedWarehouses.length === 0) {
      return { products: [], summary: { totalProducts: 0 } };
    }

    // Validar acceso si especifica almacén
    if (warehouseId && !allowedWarehouses.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este almacén");
    }

    // Obtener stock agrupado por almacén y producto
    const stockData = await db
      .select({
        warehouseId: inventoryLots.warehouseId,
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        warehouseName: warehouses.name,
        categoryName: categories.name,
        minStock: products.minStock,
        reorderPoint: products.reorderPoint,
        currentStock: sql<string>`SUM(${inventoryLots.currentQuantity})`.as('current_stock'),
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .innerJoin(warehouses, eq(inventoryLots.warehouseId, warehouses.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(inventoryLots.status, "ACTIVE"),
          warehouseId 
            ? eq(inventoryLots.warehouseId, warehouseId)
            : inArray(inventoryLots.warehouseId, allowedWarehouses)
        )
      )
      .groupBy(inventoryLots.warehouseId, inventoryLots.productId, products.id, warehouses.id, categories.id);

    // Filtrar productos con stock bajo según su minStock configurado
    const lowStockProducts = stockData
      .filter(item => {
        const currentStock = parseFloat(item.currentStock);
        const minStock = parseFloat(item.minStock || "0");
        return currentStock <= minStock;
      })
      .map(item => {
        const currentStock = parseFloat(item.currentStock);
        const minStock = parseFloat(item.minStock || "0");
        const reorderPoint = item.reorderPoint ? parseFloat(item.reorderPoint) : null;
        
        let status = "OK";
        if (currentStock <= 0) {
          status = "OUT_OF_STOCK";
        } else if (currentStock <= minStock) {
          status = "LOW_STOCK";
        } else if (reorderPoint && currentStock <= reorderPoint) {
          status = "REORDER_NEEDED";
        }

        return {
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode,
          categoryName: item.categoryName,
          currentStock: item.currentStock,
          minStock: item.minStock || "0",
          reorderPoint: item.reorderPoint,
          deficit: (minStock - currentStock).toFixed(2),
          status,
        };
      })
      .sort((a, b) => {
        // Ordenar: OUT_OF_STOCK primero, luego LOW_STOCK, luego por déficit
        const statusOrder: Record<string, number> = { OUT_OF_STOCK: 0, LOW_STOCK: 1, REORDER_NEEDED: 2, OK: 3 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return parseFloat(b.deficit) - parseFloat(a.deficit);
      });

    return {
      products: lowStockProducts,
      summary: { 
        totalProducts: lowStockProducts.length,
        outOfStock: lowStockProducts.filter(p => p.status === "OUT_OF_STOCK").length,
        lowStock: lowStockProducts.filter(p => p.status === "LOW_STOCK").length,
      },
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

  // ========== REPORTE 6: UTILIDAD/GANANCIA ==========
  async getProfitReport(
    userId: number,
    startDate: string,
    endDate: string,
    warehouseId?: number,
    includeDetails?: boolean
  ) {
    // Obtener almacenes permitidos
    const allowedWarehouses = await this.getUserWarehouses(userId);
    if (allowedWarehouses.length === 0) {
      return this.getEmptyProfitReport(startDate, endDate);
    }

    // Validar acceso si especifica almacén
    if (warehouseId && !allowedWarehouses.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este almacén");
    }

    const warehouseFilter = warehouseId 
      ? [warehouseId] 
      : allowedWarehouses;

    // ========== 1. INGRESOS BRUTOS (Ventas APPROVED) ==========
    const salesData = await db
      .select({
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        productId: salesDetail.productId,
        productName: products.name,
        productCode: products.code,
        categoryId: products.categoryId,
        categoryName: categories.name,
        quantity: salesDetail.quantity,
        convertedUnitPrice: salesDetail.convertedUnitPrice,
        realCost: salesDetail.realCost,
        margin: salesDetail.margin,
        saleDate: sql<string>`DATE_FORMAT(${sales.date}, '%Y-%m-%d')`.as('sale_date'),
        saleMonth: sql<string>`DATE_FORMAT(${sales.date}, '%Y-%m')`.as('sale_month'),
      })
      .from(salesDetail)
      .innerJoin(sales, eq(salesDetail.saleId, sales.id))
      .innerJoin(products, eq(salesDetail.productId, products.id))
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(sales.status, "APPROVED"),
          gte(sales.date, sql`${startDate}`),
          lte(sales.date, sql`${endDate}`),
          inArray(sales.warehouseId, warehouseFilter)
        )
      );

    // ========== 2. GASTOS OPERATIVOS (Expenses APPROVED) ==========
    const expensesData = await db
      .select({
        expenseId: expenses.id,
        expenseTypeId: expenses.expenseTypeId,
        expenseTypeName: expenseTypes.name,
        warehouseId: expenses.warehouseId,
        warehouseName: sql<string>`COALESCE(${warehouses.name}, 'Corporativo')`.as('warehouse_name'),
        amountBase: expenses.amountBase,
        expenseDate: sql<string>`DATE_FORMAT(${expenses.date}, '%Y-%m-%d')`.as('expense_date'),
        expenseMonth: sql<string>`DATE_FORMAT(${expenses.date}, '%Y-%m')`.as('expense_month'),
        description: expenses.description,
      })
      .from(expenses)
      .innerJoin(expenseTypes, eq(expenses.expenseTypeId, expenseTypes.id))
      .leftJoin(warehouses, eq(expenses.warehouseId, warehouses.id))
      .where(
        and(
          eq(expenses.status, "APPROVED"),
          gte(expenses.date, sql`${startDate}`),
          lte(expenses.date, sql`${endDate}`),
          warehouseId 
            ? eq(expenses.warehouseId, warehouseId)
            : sql`(${expenses.warehouseId} IN (${sql.raw(warehouseFilter.join(','))}) OR ${expenses.warehouseId} IS NULL)`
        )
      );

    // ========== 3. COMPRAS DEL PERÍODO (referencia) ==========
    const purchasesData = await db
      .select({
        totalAmount: sql<string>`SUM(${purchasesDetail.convertedUnitCost} * ${purchasesDetail.quantity})`.as('total_amount'),
        count: sql<number>`COUNT(DISTINCT ${purchases.id})`.as('count'),
      })
      .from(purchasesDetail)
      .innerJoin(purchases, eq(purchasesDetail.purchaseId, purchases.id))
      .where(
        and(
          eq(purchases.status, "APPROVED"),
          gte(purchases.date, sql`${startDate}`),
          lte(purchases.date, sql`${endDate}`),
          inArray(purchases.warehouseId, warehouseFilter)
        )
      );

    // ========== 4. TRASLADOS DEL PERÍODO (referencia) ==========
    const transfersData = await db
      .select({
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(transfers)
      .where(
        and(
          eq(transfers.status, "APPROVED"),
          gte(transfers.date, sql`${startDate}`),
          lte(transfers.date, sql`${endDate}`),
          sql`(${transfers.originWarehouseId} IN (${sql.raw(warehouseFilter.join(','))}) OR ${transfers.destinationWarehouseId} IN (${sql.raw(warehouseFilter.join(','))}))`
        )
      );

    // ========== CALCULAR TOTALES ==========
    let grossRevenue = 0;
    let costOfGoodsSold = 0;
    let totalUnits = 0;

    salesData.forEach((sale) => {
      const qty = parseFloat(sale.quantity || "0");
      const price = parseFloat(sale.convertedUnitPrice || "0");
      const cost = parseFloat(sale.realCost || "0");
      
      grossRevenue += qty * price;
      costOfGoodsSold += cost;
      totalUnits += qty;
    });

    const grossProfit = grossRevenue - costOfGoodsSold;
    const grossMarginPercent = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

    let operatingExpenses = 0;
    expensesData.forEach((expense) => {
      operatingExpenses += parseFloat(expense.amountBase || "0");
    });

    const operatingProfit = grossProfit - operatingExpenses;
    const operatingMarginPercent = grossRevenue > 0 ? (operatingProfit / grossRevenue) * 100 : 0;

    const purchasesTotal = parseFloat(purchasesData[0]?.totalAmount || "0");
    const purchasesCount = purchasesData[0]?.count || 0;
    const transfersCount = transfersData[0]?.count || 0;

    // ========== AGRUPAR POR ALMACÉN ==========
    const byWarehouseMap = new Map<number | null, {
      warehouseId: number | null;
      warehouseName: string;
      grossRevenue: number;
      costOfGoodsSold: number;
      grossProfit: number;
      operatingExpenses: number;
      unitsSold: number;
    }>();

    // Procesar ventas por almacén
    salesData.forEach((sale) => {
      const wId = sale.warehouseId;
      const current = byWarehouseMap.get(wId) || {
        warehouseId: wId,
        warehouseName: sale.warehouseName,
        grossRevenue: 0,
        costOfGoodsSold: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        unitsSold: 0,
      };

      const qty = parseFloat(sale.quantity || "0");
      const price = parseFloat(sale.convertedUnitPrice || "0");
      const cost = parseFloat(sale.realCost || "0");
      
      current.grossRevenue += qty * price;
      current.costOfGoodsSold += cost;
      current.unitsSold += qty;
      current.grossProfit = current.grossRevenue - current.costOfGoodsSold;

      byWarehouseMap.set(wId, current);
    });

    // Procesar gastos por almacén
    expensesData.forEach((expense) => {
      const wId = expense.warehouseId;
      const current = byWarehouseMap.get(wId) || {
        warehouseId: wId,
        warehouseName: expense.warehouseName,
        grossRevenue: 0,
        costOfGoodsSold: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        unitsSold: 0,
      };

      current.operatingExpenses += parseFloat(expense.amountBase || "0");
      byWarehouseMap.set(wId, current);
    });

    const byWarehouse = Array.from(byWarehouseMap.values()).map((w) => ({
      warehouseId: w.warehouseId,
      warehouseName: w.warehouseName,
      grossRevenue: parseFloat(w.grossRevenue.toFixed(2)),
      costOfGoodsSold: parseFloat(w.costOfGoodsSold.toFixed(2)),
      grossProfit: parseFloat(w.grossProfit.toFixed(2)),
      grossMarginPercent: w.grossRevenue > 0 ? parseFloat(((w.grossProfit / w.grossRevenue) * 100).toFixed(2)) : 0,
      operatingExpenses: parseFloat(w.operatingExpenses.toFixed(2)),
      operatingProfit: parseFloat((w.grossProfit - w.operatingExpenses).toFixed(2)),
      unitsSold: parseFloat(w.unitsSold.toFixed(2)),
    }));

    // ========== AGRUPAR POR MES ==========
    const byMonthMap = new Map<string, {
      month: string;
      grossRevenue: number;
      costOfGoodsSold: number;
      grossProfit: number;
      operatingExpenses: number;
      unitsSold: number;
    }>();

    salesData.forEach((sale) => {
      const month = sale.saleMonth;
      const current = byMonthMap.get(month) || {
        month,
        grossRevenue: 0,
        costOfGoodsSold: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        unitsSold: 0,
      };

      const qty = parseFloat(sale.quantity || "0");
      const price = parseFloat(sale.convertedUnitPrice || "0");
      const cost = parseFloat(sale.realCost || "0");
      
      current.grossRevenue += qty * price;
      current.costOfGoodsSold += cost;
      current.unitsSold += qty;
      current.grossProfit = current.grossRevenue - current.costOfGoodsSold;

      byMonthMap.set(month, current);
    });

    expensesData.forEach((expense) => {
      const month = expense.expenseMonth;
      const current = byMonthMap.get(month) || {
        month,
        grossRevenue: 0,
        costOfGoodsSold: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        unitsSold: 0,
      };

      current.operatingExpenses += parseFloat(expense.amountBase || "0");
      byMonthMap.set(month, current);
    });

    const byMonth = Array.from(byMonthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        month: m.month,
        grossRevenue: parseFloat(m.grossRevenue.toFixed(2)),
        costOfGoodsSold: parseFloat(m.costOfGoodsSold.toFixed(2)),
        grossProfit: parseFloat(m.grossProfit.toFixed(2)),
        grossMarginPercent: m.grossRevenue > 0 ? parseFloat(((m.grossProfit / m.grossRevenue) * 100).toFixed(2)) : 0,
        operatingExpenses: parseFloat(m.operatingExpenses.toFixed(2)),
        operatingProfit: parseFloat((m.grossProfit - m.operatingExpenses).toFixed(2)),
        unitsSold: parseFloat(m.unitsSold.toFixed(2)),
      }));

    // ========== AGRUPAR POR CATEGORÍA ==========
    const byCategoryMap = new Map<number | null, {
      categoryId: number | null;
      categoryName: string;
      grossRevenue: number;
      costOfGoodsSold: number;
      grossProfit: number;
      unitsSold: number;
    }>();

    salesData.forEach((sale) => {
      const catId = sale.categoryId;
      const current = byCategoryMap.get(catId) || {
        categoryId: catId,
        categoryName: sale.categoryName || "Sin Categoría",
        grossRevenue: 0,
        costOfGoodsSold: 0,
        grossProfit: 0,
        unitsSold: 0,
      };

      const qty = parseFloat(sale.quantity || "0");
      const price = parseFloat(sale.convertedUnitPrice || "0");
      const cost = parseFloat(sale.realCost || "0");
      
      current.grossRevenue += qty * price;
      current.costOfGoodsSold += cost;
      current.unitsSold += qty;
      current.grossProfit = current.grossRevenue - current.costOfGoodsSold;

      byCategoryMap.set(catId, current);
    });

    const byCategory = Array.from(byCategoryMap.values())
      .sort((a, b) => b.grossProfit - a.grossProfit)
      .map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        grossRevenue: parseFloat(c.grossRevenue.toFixed(2)),
        costOfGoodsSold: parseFloat(c.costOfGoodsSold.toFixed(2)),
        grossProfit: parseFloat(c.grossProfit.toFixed(2)),
        grossMarginPercent: c.grossRevenue > 0 ? parseFloat(((c.grossProfit / c.grossRevenue) * 100).toFixed(2)) : 0,
        unitsSold: parseFloat(c.unitsSold.toFixed(2)),
      }));

    // ========== GASTOS POR TIPO ==========
    const expensesByTypeMap = new Map<number, {
      expenseTypeId: number;
      expenseTypeName: string;
      totalAmount: number;
      count: number;
    }>();

    expensesData.forEach((expense) => {
      const typeId = expense.expenseTypeId;
      const current = expensesByTypeMap.get(typeId) || {
        expenseTypeId: typeId,
        expenseTypeName: expense.expenseTypeName,
        totalAmount: 0,
        count: 0,
      };

      current.totalAmount += parseFloat(expense.amountBase || "0");
      current.count++;
      expensesByTypeMap.set(typeId, current);
    });

    const expensesByType = Array.from(expensesByTypeMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .map((e) => ({
        expenseTypeId: e.expenseTypeId,
        expenseTypeName: e.expenseTypeName,
        totalAmount: parseFloat(e.totalAmount.toFixed(2)),
        count: e.count,
        percentOfTotal: operatingExpenses > 0 ? parseFloat(((e.totalAmount / operatingExpenses) * 100).toFixed(2)) : 0,
      }));

    // ========== TOP PRODUCTOS (más rentables) ==========
    const productProfitMap = new Map<number, {
      productId: number;
      productName: string;
      productCode: string;
      categoryName: string;
      unitsSold: number;
      revenue: number;
      cost: number;
      profit: number;
    }>();

    salesData.forEach((sale) => {
      const pId = sale.productId;
      const current = productProfitMap.get(pId) || {
        productId: pId,
        productName: sale.productName,
        productCode: sale.productCode,
        categoryName: sale.categoryName || "Sin Categoría",
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };

      const qty = parseFloat(sale.quantity || "0");
      const price = parseFloat(sale.convertedUnitPrice || "0");
      const cost = parseFloat(sale.realCost || "0");
      
      current.unitsSold += qty;
      current.revenue += qty * price;
      current.cost += cost;
      current.profit = current.revenue - current.cost;

      productProfitMap.set(pId, current);
    });

    const topProducts = Array.from(productProfitMap.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10)
      .map((p) => ({
        productId: p.productId,
        productName: p.productName,
        productCode: p.productCode,
        categoryName: p.categoryName,
        unitsSold: parseFloat(p.unitsSold.toFixed(2)),
        revenue: parseFloat(p.revenue.toFixed(2)),
        cost: parseFloat(p.cost.toFixed(2)),
        profit: parseFloat(p.profit.toFixed(2)),
        marginPercent: p.revenue > 0 ? parseFloat(((p.profit / p.revenue) * 100).toFixed(2)) : 0,
      }));

    // ========== PRODUCTO DETALLADO (si se solicita) ==========
    let productDetails: any[] | undefined;
    if (includeDetails) {
      productDetails = Array.from(productProfitMap.values())
        .sort((a, b) => b.profit - a.profit)
        .map((p) => ({
          productId: p.productId,
          productName: p.productName,
          productCode: p.productCode,
          categoryName: p.categoryName,
          unitsSold: parseFloat(p.unitsSold.toFixed(2)),
          revenue: parseFloat(p.revenue.toFixed(2)),
          cost: parseFloat(p.cost.toFixed(2)),
          profit: parseFloat(p.profit.toFixed(2)),
          marginPercent: p.revenue > 0 ? parseFloat(((p.profit / p.revenue) * 100).toFixed(2)) : 0,
        }));
    }

    return {
      period: {
        startDate,
        endDate,
      },
      summary: {
        grossRevenue: parseFloat(grossRevenue.toFixed(2)),
        costOfGoodsSold: parseFloat(costOfGoodsSold.toFixed(2)),
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        grossMarginPercent: parseFloat(grossMarginPercent.toFixed(2)),
        operatingExpenses: parseFloat(operatingExpenses.toFixed(2)),
        operatingProfit: parseFloat(operatingProfit.toFixed(2)),
        operatingMarginPercent: parseFloat(operatingMarginPercent.toFixed(2)),
        totalUnitsSold: parseFloat(totalUnits.toFixed(2)),
        purchasesTotal: parseFloat(purchasesTotal.toFixed(2)),
        purchasesCount,
        transfersCount,
        currency: "CUP",
      },
      byWarehouse,
      byMonth,
      byCategory,
      expensesByType,
      topProducts,
      ...(productDetails && { productDetails }),
    };
  }

  // Reporte vacío
  private getEmptyProfitReport(startDate: string, endDate: string) {
    return {
      period: { startDate, endDate },
      summary: {
        grossRevenue: 0,
        costOfGoodsSold: 0,
        grossProfit: 0,
        grossMarginPercent: 0,
        operatingExpenses: 0,
        operatingProfit: 0,
        operatingMarginPercent: 0,
        totalUnitsSold: 0,
        purchasesTotal: 0,
        purchasesCount: 0,
        transfersCount: 0,
        currency: "CUP",
      },
      byWarehouse: [],
      byMonth: [],
      byCategory: [],
      expensesByType: [],
      topProducts: [],
    };
  }

  // ========== EXPORTAR REPORTE DE UTILIDAD A CSV ==========
  async exportProfitReportCSV(
    userId: number,
    startDate: string,
    endDate: string,
    warehouseId?: number
  ): Promise<string> {
    const report = await this.getProfitReport(userId, startDate, endDate, warehouseId, true);

    const lines: string[] = [];

    // Encabezado
    lines.push("REPORTE DE UTILIDAD");
    lines.push(`Período: ${startDate} a ${endDate}`);
    lines.push(`Generado: ${new Date().toISOString()}`);
    lines.push("");

    // Resumen
    lines.push("=== RESUMEN ===");
    lines.push(`Ingresos Brutos (CUP),${report.summary.grossRevenue}`);
    lines.push(`Costo de Ventas (CUP),${report.summary.costOfGoodsSold}`);
    lines.push(`Utilidad Bruta (CUP),${report.summary.grossProfit}`);
    lines.push(`Margen Bruto (%),${report.summary.grossMarginPercent}`);
    lines.push(`Gastos Operativos (CUP),${report.summary.operatingExpenses}`);
    lines.push(`Utilidad Operativa (CUP),${report.summary.operatingProfit}`);
    lines.push(`Margen Operativo (%),${report.summary.operatingMarginPercent}`);
    lines.push(`Unidades Vendidas,${report.summary.totalUnitsSold}`);
    lines.push(`Total Compras (CUP),${report.summary.purchasesTotal}`);
    lines.push(`Cantidad de Compras,${report.summary.purchasesCount}`);
    lines.push(`Cantidad de Traslados,${report.summary.transfersCount}`);
    lines.push("");

    // Por Almacén
    lines.push("=== POR ALMACÉN ===");
    lines.push("Almacén,Ingresos,Costo Ventas,Utilidad Bruta,Margen %,Gastos,Utilidad Operativa");
    report.byWarehouse.forEach((w) => {
      lines.push(`${w.warehouseName},${w.grossRevenue},${w.costOfGoodsSold},${w.grossProfit},${w.grossMarginPercent},${w.operatingExpenses},${w.operatingProfit}`);
    });
    lines.push("");

    // Por Mes
    lines.push("=== POR MES ===");
    lines.push("Mes,Ingresos,Costo Ventas,Utilidad Bruta,Margen %,Gastos,Utilidad Operativa");
    report.byMonth.forEach((m) => {
      lines.push(`${m.month},${m.grossRevenue},${m.costOfGoodsSold},${m.grossProfit},${m.grossMarginPercent},${m.operatingExpenses},${m.operatingProfit}`);
    });
    lines.push("");

    // Por Categoría
    lines.push("=== POR CATEGORÍA ===");
    lines.push("Categoría,Ingresos,Costo Ventas,Utilidad Bruta,Margen %,Unidades");
    report.byCategory.forEach((c) => {
      lines.push(`${c.categoryName},${c.grossRevenue},${c.costOfGoodsSold},${c.grossProfit},${c.grossMarginPercent},${c.unitsSold}`);
    });
    lines.push("");

    // Gastos por Tipo
    lines.push("=== GASTOS POR TIPO ===");
    lines.push("Tipo de Gasto,Monto Total,Cantidad,% del Total");
    report.expensesByType.forEach((e) => {
      lines.push(`${e.expenseTypeName},${e.totalAmount},${e.count},${e.percentOfTotal}`);
    });
    lines.push("");

    // Productos Detallados
    if ('productDetails' in report && report.productDetails) {
      lines.push("=== DETALLE POR PRODUCTO ===");
      lines.push("Código,Producto,Categoría,Unidades,Ingresos,Costo,Utilidad,Margen %");
      (report.productDetails as any[]).forEach((p: any) => {
        lines.push(`${p.productCode},${p.productName},${p.categoryName},${p.unitsSold},${p.revenue},${p.cost},${p.profit},${p.marginPercent}`);
      });
    }

    return lines.join("\n");
  }

  // ========== REPORTE 7: INVENTARIO VALORIZADO COMPLETO (NIC 2) ==========
  // Informe de inventario con valuación FIFO, cumpliendo estándares contables
  async getInventoryValuation(
    userId: number,
    options: {
      warehouseId?: number;
      categoryId?: number;
      productId?: number;
      cutoffDate?: string;
      onlyWithStock?: boolean;
      onlyBelowMin?: boolean;
      groupBy?: "warehouse" | "category" | "supplier" | "age";
      includeMovements?: boolean;
      includeKardex?: boolean;
      startDate?: string;
      endDate?: string;
    }
  ) {
    try {
      // Obtener almacenes permitidos
      const allowedWarehouses = await this.getUserWarehouses(userId);
      if (allowedWarehouses.length === 0) {
        return this.getEmptyInventoryValuation();
      }

      // Validar acceso si especifica almacén
      if (options.warehouseId && !allowedWarehouses.includes(options.warehouseId)) {
        throw new ForbiddenError("No tienes acceso a este almacén");
      }

      const warehouseFilter = options.warehouseId 
        ? [options.warehouseId] 
        : allowedWarehouses;

      const today = options.cutoffDate || new Date().toISOString().split('T')[0];

    // ========== 1. OBTENER LOTES ACTIVOS (excluir LOCKED) ==========
    const conditions: any[] = [
      eq(inventoryLots.status, "ACTIVE"), // Solo ACTIVE, excluir LOCKED
      inArray(inventoryLots.warehouseId, warehouseFilter),
    ];

    if (options.productId) {
      conditions.push(eq(inventoryLots.productId, options.productId));
    }

    if (options.categoryId) {
      conditions.push(eq(products.categoryId, options.categoryId));
    }

    // Si hay fecha de corte, considerar solo lotes que existían en esa fecha
    if (options.cutoffDate) {
      conditions.push(lte(inventoryLots.entryDate, sql`${options.cutoffDate}`));
    }

    const lotsData = await db
      .select({
        // Lote
        lotId: inventoryLots.id,
        lotCode: inventoryLots.lotCode,
        entryDate: sql<string>`DATE_FORMAT(${inventoryLots.entryDate}, '%Y-%m-%d')`.as('entry_date'),
        initialQuantity: inventoryLots.initialQuantity,
        currentQuantity: inventoryLots.currentQuantity,
        unitCostBase: inventoryLots.unitCostBase,
        originalCurrencyId: inventoryLots.originalCurrencyId,
        originalUnitCost: inventoryLots.originalUnitCost,
        exchangeRate: inventoryLots.exchangeRate,
        sourceType: inventoryLots.sourceType,
        sourceId: inventoryLots.sourceId,
        // Producto
        productId: products.id,
        productCode: products.code,
        productName: products.name,
        productDescription: products.description,
        minStock: products.minStock,
        reorderPoint: products.reorderPoint,
        // Categoría
        categoryId: categories.id,
        categoryName: sql<string>`COALESCE(${categories.name}, 'Sin Categoría')`.as('category_name'),
        // Unidad
        unitId: units.id,
        unitName: units.name,
        unitShortName: units.shortName,
        // Almacén
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        warehouseDireccion: warehouses.direccion,
        // Moneda original
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .innerJoin(warehouses, eq(inventoryLots.warehouseId, warehouses.id))
      .innerJoin(units, eq(products.unitId, units.id))
      .innerJoin(currencies, eq(inventoryLots.originalCurrencyId, currencies.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(asc(products.name), asc(inventoryLots.entryDate));

    // Calcular días en inventario para cada lote
    const lotsWithAge = lotsData.map(lot => {
      const entryDateObj = new Date(lot.entryDate);
      const todayObj = new Date(today);
      const daysInInventory = Math.floor((todayObj.getTime() - entryDateObj.getTime()) / (1000 * 60 * 60 * 24));
      const qty = parseFloat(lot.currentQuantity || "0");
      const unitCost = parseFloat(lot.unitCostBase || "0");
      const totalCost = qty * unitCost;
      
      return {
        lotId: lot.lotId,
        lotCode: lot.lotCode,
        entryDate: lot.entryDate,
        initialQuantity: lot.initialQuantity,
        originalCurrencyId: lot.originalCurrencyId,
        originalUnitCost: lot.originalUnitCost,
        exchangeRate: lot.exchangeRate,
        sourceType: lot.sourceType,
        sourceId: lot.sourceId,
        productId: lot.productId,
        productCode: lot.productCode,
        productName: lot.productName,
        productDescription: lot.productDescription,
        minStock: lot.minStock,
        reorderPoint: lot.reorderPoint,
        categoryId: lot.categoryId,
        categoryName: lot.categoryName,
        unitId: lot.unitId,
        unitName: lot.unitName,
        unitShortName: lot.unitShortName,
        warehouseId: lot.warehouseId,
        warehouseName: lot.warehouseName,
        warehouseDireccion: lot.warehouseDireccion,
        currencyCode: lot.currencyCode,
        currencySymbol: lot.currencySymbol,
        currentQuantity: qty,
        unitCostBase: unitCost,
        totalCost,
        daysInInventory,
        ageCategory: this.getAgeCategory(daysInInventory),
      };
    });

    // Filtrar si solo quiere productos con stock
    let filteredLots = lotsWithAge;
    if (options.onlyWithStock) {
      filteredLots = lotsWithAge.filter(lot => lot.currentQuantity > 0);
    }

    // ========== 2. AGRUPAR POR PRODUCTO/ALMACÉN ==========
    const productMap = new Map<string, {
      productId: number;
      productCode: string;
      productName: string;
      productDescription: string | null;
      categoryId: number | null;
      categoryName: string;
      unitId: number;
      unitName: string;
      unitShortName: string;
      minStock: number;
      reorderPoint: number | null;
      warehouseId: number;
      warehouseName: string;
      totalQuantity: number;
      totalCost: number;
      avgUnitCost: number;
      lotCount: number;
      oldestLotDate: string;
      newestLotDate: string;
      maxDaysInInventory: number;
      lots: typeof lotsWithAge;
    }>();

    filteredLots.forEach(lot => {
      const key = `${lot.warehouseId}_${lot.productId}`;
      const existing = productMap.get(key);
      
      if (!existing) {
        productMap.set(key, {
          productId: lot.productId,
          productCode: lot.productCode,
          productName: lot.productName,
          productDescription: lot.productDescription,
          categoryId: lot.categoryId,
          categoryName: lot.categoryName,
          unitId: lot.unitId,
          unitName: lot.unitName,
          unitShortName: lot.unitShortName,
          minStock: parseFloat(lot.minStock || "0"),
          reorderPoint: lot.reorderPoint ? parseFloat(lot.reorderPoint) : null,
          warehouseId: lot.warehouseId,
          warehouseName: lot.warehouseName,
          totalQuantity: lot.currentQuantity,
          totalCost: lot.totalCost,
          avgUnitCost: lot.unitCostBase,
          lotCount: 1,
          oldestLotDate: lot.entryDate,
          newestLotDate: lot.entryDate,
          maxDaysInInventory: lot.daysInInventory,
          lots: [lot],
        });
      } else {
        existing.totalQuantity += lot.currentQuantity;
        existing.totalCost += lot.totalCost;
        existing.lotCount++;
        existing.lots.push(lot);
        
        if (lot.entryDate < existing.oldestLotDate) {
          existing.oldestLotDate = lot.entryDate;
          existing.maxDaysInInventory = lot.daysInInventory;
        }
        if (lot.entryDate > existing.newestLotDate) {
          existing.newestLotDate = lot.entryDate;
        }
      }
    });

    // Calcular costo promedio ponderado para cada producto
    productMap.forEach((item) => {
      item.avgUnitCost = item.totalQuantity > 0 ? item.totalCost / item.totalQuantity : 0;
    });

    // Convertir a array y filtrar bajo mínimo si aplica
    let productList = Array.from(productMap.values());
    
    if (options.onlyBelowMin) {
      productList = productList.filter(p => p.totalQuantity < p.minStock);
    }

    // ========== 3. RESUMEN GENERAL ==========
    const summary = {
      reportDate: today,
      method: "FIFO" as const, // Método de valuación
      currency: "CUP",
      totalProducts: new Set(productList.map(p => p.productId)).size,
      totalSKUs: productList.length, // Producto-almacén
      totalUnits: productList.reduce((sum, p) => sum + p.totalQuantity, 0),
      totalValue: productList.reduce((sum, p) => sum + p.totalCost, 0),
      totalLots: filteredLots.length,
      avgDaysInInventory: filteredLots.length > 0 
        ? filteredLots.reduce((sum, l) => sum + l.daysInInventory, 0) / filteredLots.length 
        : 0,
      productsWithStock: productList.filter(p => p.totalQuantity > 0).length,
      productsBelowMin: productList.filter(p => p.totalQuantity < p.minStock).length,
      productsAtReorder: productList.filter(p => p.reorderPoint && p.totalQuantity <= p.reorderPoint).length,
    };

    // ========== 4. AGRUPACIONES ==========
    // Por Almacén
    const byWarehouse = this.groupInventoryByWarehouse(productList);
    
    // Por Categoría
    const byCategory = this.groupInventoryByCategory(productList);
    
    // Por Antigüedad (aging)
    const byAge = this.groupInventoryByAge(filteredLots);

    // ========== 5. PRODUCTOS DETALLADOS ==========
    const items = productList.map(p => ({
      productId: p.productId,
      productCode: p.productCode,
      productName: p.productName,
      categoryName: p.categoryName,
      unitShortName: p.unitShortName,
      warehouseId: p.warehouseId,
      warehouseName: p.warehouseName,
      quantity: parseFloat(p.totalQuantity.toFixed(2)),
      avgUnitCost: parseFloat(p.avgUnitCost.toFixed(2)),
      totalCost: parseFloat(p.totalCost.toFixed(2)),
      minStock: p.minStock,
      reorderPoint: p.reorderPoint,
      lotCount: p.lotCount,
      oldestLotDate: p.oldestLotDate,
      maxDaysInInventory: p.maxDaysInInventory,
      status: this.getStockStatus(p.totalQuantity, p.minStock, p.reorderPoint),
    }));

    // ========== 6. MOVIMIENTOS (si se solicitan) ==========
    let movements: any[] | undefined;
    if (options.includeMovements && options.startDate) {
      movements = await this.getMovementsForValuation(
        warehouseFilter,
        options.startDate,
        options.endDate || today,
        options.productId
      );
    }

    // ========== 7. KARDEX (si se solicita) ==========
    let kardex: any[] | undefined;
    if (options.includeKardex && options.productId) {
      const kardexResult = await this.getKardex(
        userId,
        options.productId,
        options.warehouseId,
        options.startDate,
        options.endDate || today
      );
      kardex = kardexResult.movements;
    }

    // Construir resultado base
    const result: any = {
      report: {
        title: "Informe de Inventario Valorizado",
        subtitle: `Método de Valuación: FIFO (Primeras Entradas, Primeras Salidas)`,
        generatedAt: new Date().toISOString(),
        cutoffDate: today,
        standard: "NIC 2 - Inventarios",
      },
      summary: {
        reportDate: summary.reportDate,
        method: summary.method,
        currency: summary.currency,
        totalProducts: summary.totalProducts,
        totalSKUs: summary.totalSKUs,
        totalUnits: parseFloat((summary.totalUnits || 0).toFixed(2)),
        totalValue: parseFloat((summary.totalValue || 0).toFixed(2)),
        totalLots: summary.totalLots,
        avgDaysInInventory: parseFloat((summary.avgDaysInInventory || 0).toFixed(1)),
        productsWithStock: summary.productsWithStock,
        productsBelowMin: summary.productsBelowMin,
        productsAtReorder: summary.productsAtReorder,
      },
      byWarehouse: byWarehouse || [],
      byCategory: byCategory || [],
      byAge: byAge || [],
      items: items || [],
    };

    // Agregar movimientos y kardex si existen
    if (movements) {
      result.movements = movements;
    }
    if (kardex) {
      result.kardex = kardex;
    }

    return result;
    } catch (error: any) {
      console.error("Error en getInventoryValuation:", error);
      throw error;
    }
  }

  // Helpers para el informe de inventario
  private getAgeCategory(days: number): string {
    if (days <= 30) return "0-30 días";
    if (days <= 60) return "31-60 días";
    if (days <= 90) return "61-90 días";
    if (days <= 180) return "91-180 días";
    return "+180 días";
  }

  private getStockStatus(quantity: number, minStock: number, reorderPoint: number | null): string {
    if (quantity <= 0) return "SIN_STOCK";
    if (quantity < minStock) return "BAJO_MINIMO";
    if (reorderPoint && quantity <= reorderPoint) return "PUNTO_REORDEN";
    return "NORMAL";
  }

  private groupInventoryByWarehouse(productList: any[]) {
    const map = new Map<number, { warehouseId: number; warehouseName: string; totalUnits: number; totalValue: number; productCount: number }>();
    
    productList.forEach(p => {
      const existing = map.get(p.warehouseId);
      if (!existing) {
        map.set(p.warehouseId, {
          warehouseId: p.warehouseId,
          warehouseName: p.warehouseName,
          totalUnits: p.totalQuantity,
          totalValue: p.totalCost,
          productCount: 1,
        });
      } else {
        existing.totalUnits += p.totalQuantity;
        existing.totalValue += p.totalCost;
        existing.productCount++;
      }
    });

    return Array.from(map.values()).map(w => ({
      ...w,
      totalUnits: parseFloat(w.totalUnits.toFixed(2)),
      totalValue: parseFloat(w.totalValue.toFixed(2)),
    }));
  }

  private groupInventoryByCategory(productList: any[]) {
    const map = new Map<number | null, { categoryId: number | null; categoryName: string; totalUnits: number; totalValue: number; productCount: number }>();
    
    productList.forEach(p => {
      const existing = map.get(p.categoryId);
      if (!existing) {
        map.set(p.categoryId, {
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          totalUnits: p.totalQuantity,
          totalValue: p.totalCost,
          productCount: 1,
        });
      } else {
        existing.totalUnits += p.totalQuantity;
        existing.totalValue += p.totalCost;
        existing.productCount++;
      }
    });

    return Array.from(map.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .map(c => ({
        ...c,
        totalUnits: parseFloat(c.totalUnits.toFixed(2)),
        totalValue: parseFloat(c.totalValue.toFixed(2)),
      }));
  }

  private groupInventoryByAge(lots: any[]) {
    const categories = ["0-30 días", "31-60 días", "61-90 días", "91-180 días", "+180 días"];
    const map = new Map<string, { ageCategory: string; totalUnits: number; totalValue: number; lotCount: number }>();
    
    // Inicializar todas las categorías
    categories.forEach(cat => {
      map.set(cat, { ageCategory: cat, totalUnits: 0, totalValue: 0, lotCount: 0 });
    });

    lots.forEach(lot => {
      const existing = map.get(lot.ageCategory)!;
      existing.totalUnits += lot.currentQuantity;
      existing.totalValue += lot.totalCost;
      existing.lotCount++;
    });

    return categories.map(cat => {
      const data = map.get(cat)!;
      return {
        ...data,
        totalUnits: parseFloat(data.totalUnits.toFixed(2)),
        totalValue: parseFloat(data.totalValue.toFixed(2)),
      };
    });
  }

  private async getMovementsForValuation(
    warehouseIds: number[],
    startDate: string,
    endDate: string,
    productId?: number
  ) {
    const conditions: any[] = [
      inArray(inventoryMovements.warehouseId, warehouseIds),
      gte(inventoryMovements.createdAt, sql`${startDate}`),
      lte(inventoryMovements.createdAt, sql`${endDate} 23:59:59`),
    ];

    if (productId) {
      conditions.push(eq(inventoryMovements.productId, productId));
    }

    const movements = await db
      .select({
        id: inventoryMovements.id,
        type: inventoryMovements.type,
        status: inventoryMovements.status,
        productId: inventoryMovements.productId,
        productName: products.name,
        productCode: products.code,
        warehouseId: inventoryMovements.warehouseId,
        warehouseName: warehouses.name,
        quantity: inventoryMovements.quantity,
        reference: inventoryMovements.reference,
        reason: inventoryMovements.reason,
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .where(and(...conditions))
      .orderBy(desc(inventoryMovements.createdAt));

    // Calcular resumen de movimientos
    const entriesCount = movements.filter(m => m.type.includes("ENTRY")).length;
    const exitsCount = movements.filter(m => m.type.includes("EXIT")).length;
    const totalEntries = movements
      .filter(m => m.type.includes("ENTRY"))
      .reduce((sum, m) => sum + parseFloat(m.quantity), 0);
    const totalExits = movements
      .filter(m => m.type.includes("EXIT"))
      .reduce((sum, m) => sum + parseFloat(m.quantity), 0);

    return {
      summary: {
        entriesCount,
        exitsCount,
        totalEntries: parseFloat(totalEntries.toFixed(2)),
        totalExits: parseFloat(totalExits.toFixed(2)),
        netChange: parseFloat((totalEntries - totalExits).toFixed(2)),
      },
      items: movements.map(m => ({
        ...m,
        quantity: parseFloat(m.quantity),
        isEntry: m.type.includes("ENTRY"),
      })),
    };
  }

  private getEmptyInventoryValuation() {
    return {
      report: {
        title: "Informe de Inventario Valorizado",
        subtitle: "Método de Valuación: FIFO",
        generatedAt: new Date().toISOString(),
        cutoffDate: new Date().toISOString().split('T')[0],
        standard: "NIC 2 - Inventarios",
      },
      summary: {
        reportDate: new Date().toISOString().split('T')[0],
        method: "FIFO",
        currency: "CUP",
        totalProducts: 0,
        totalSKUs: 0,
        totalUnits: 0,
        totalValue: 0,
        totalLots: 0,
        avgDaysInInventory: 0,
        productsWithStock: 0,
        productsBelowMin: 0,
        productsAtReorder: 0,
      },
      byWarehouse: [],
      byCategory: [],
      byAge: [],
      items: [],
    };
  }

  // Exportar informe de inventario a CSV
  async exportInventoryValuationCSV(userId: number, warehouseId?: number, categoryId?: number): Promise<string> {
    const report = await this.getInventoryValuation(userId, { warehouseId, categoryId });
    const lines: string[] = [];

    // Encabezado
    lines.push(`${report.report.title}`);
    lines.push(`${report.report.subtitle}`);
    lines.push(`Generado: ${report.report.generatedAt}`);
    lines.push(`Fecha de Corte: ${report.summary.reportDate}`);
    lines.push(`Norma: ${report.report.standard}`);
    lines.push("");

    // Resumen
    lines.push("=== RESUMEN ===");
    lines.push(`Total Productos,${report.summary.totalProducts}`);
    lines.push(`Total SKUs (Producto-Almacén),${report.summary.totalSKUs}`);
    lines.push(`Total Unidades,${report.summary.totalUnits}`);
    lines.push(`Valor Total (CUP),${report.summary.totalValue}`);
    lines.push(`Total Lotes,${report.summary.totalLots}`);
    lines.push(`Días Promedio en Inventario,${report.summary.avgDaysInInventory}`);
    lines.push(`Productos Con Stock,${report.summary.productsWithStock}`);
    lines.push(`Productos Bajo Mínimo,${report.summary.productsBelowMin}`);
    lines.push(`Productos en Punto de Reorden,${report.summary.productsAtReorder}`);
    lines.push("");

    // Por Almacén
    lines.push("=== POR ALMACÉN ===");
    lines.push("Almacén,Cantidad Productos,Unidades,Valor (CUP)");
    report.byWarehouse.forEach(w => {
      lines.push(`${w.warehouseName},${w.productCount},${w.totalUnits},${w.totalValue}`);
    });
    lines.push("");

    // Por Categoría
    lines.push("=== POR CATEGORÍA ===");
    lines.push("Categoría,Cantidad Productos,Unidades,Valor (CUP)");
    report.byCategory.forEach(c => {
      lines.push(`${c.categoryName},${c.productCount},${c.totalUnits},${c.totalValue}`);
    });
    lines.push("");

    // Por Antigüedad
    lines.push("=== POR ANTIGÜEDAD ===");
    lines.push("Rango,Lotes,Unidades,Valor (CUP)");
    report.byAge.forEach(a => {
      lines.push(`${a.ageCategory},${a.lotCount},${a.totalUnits},${a.totalValue}`);
    });
    lines.push("");

    // Detalle de productos
    lines.push("=== DETALLE DE PRODUCTOS ===");
    lines.push("Código,Producto,Categoría,Almacén,Unidad,Cantidad,Costo Promedio,Costo Total,Stock Mínimo,Estado,Lotes,Días Máx");
    report.items.forEach(item => {
      lines.push(`${item.productCode},${item.productName},${item.categoryName},${item.warehouseName},${item.unitShortName},${item.quantity},${item.avgUnitCost},${item.totalCost},${item.minStock},${item.status},${item.lotCount},${item.maxDaysInInventory}`);
    });

    return lines.join("\n");
  }
}
