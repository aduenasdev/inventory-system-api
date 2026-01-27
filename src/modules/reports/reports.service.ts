import { db } from "../../db/connection";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { categories } from "../../db/schema/categories";
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
}
