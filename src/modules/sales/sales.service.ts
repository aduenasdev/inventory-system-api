import { db } from "../../db/connection";
import { sales } from "../../db/schema/sales";
import { salesDetail } from "../../db/schema/sales_detail";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventory } from "../../db/schema/inventory";
import { products } from "../../db/schema/products";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { users } from "../../db/schema/users";
import { eq, and, sql, desc, gte, lte, inArray } from "drizzle-orm";
import { normalizeBusinessDate } from "../../utils/date";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";

export class SalesService {
  // Generar número de factura
  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [lastSale] = await db
      .select()
      .from(sales)
      .where(sql`invoice_number LIKE ${`FV-${year}%`}`)
      .orderBy(desc(sales.id))
      .limit(1);

    let nextNumber = 1;
    if (lastSale) {
      const lastNumber = parseInt(lastSale.invoiceNumber.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    return `FV-${year}-${nextNumber.toString().padStart(5, "0")}`;
  }

  // Obtener tasa de cambio
  private async getExchangeRate(fromCurrencyId: number, toCurrencyId: number, date: string) {
    if (fromCurrencyId === toCurrencyId) {
      return null;
    }

    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrencyId, fromCurrencyId),
          eq(exchangeRates.toCurrencyId, toCurrencyId),
          sql`${exchangeRates.date} = ${date}`
        )
      );

    if (!rate) {
      throw new NotFoundError(
        `No existe tasa de cambio para la fecha ${date} entre las monedas especificadas. Debe crearla antes de continuar.`
      );
    }

    return parseFloat(rate.rate);
  }

  // Verificar stock disponible
  private async checkStock(warehouseId: number, productId: number, quantity: number) {
    const [stock] = await db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.warehouseId, warehouseId),
          eq(inventory.productId, productId)
        )
      );

    const currentQty = stock ? parseFloat(stock.currentQuantity) : 0;
    if (currentQty < quantity) {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));
      throw new ValidationError(
        `Stock insuficiente para el producto "${product.name}". Disponible: ${currentQty}, Solicitado: ${quantity}`
      );
    }
  }

  // Crear factura de venta
  async createSale(data: {
    customerName?: string;
    customerPhone?: string;
    date: string;
    warehouseId: number;
    currencyId: number;
    notes?: string;
    details: Array<{
      productId: number;
      quantity: number;
      unitPrice: number;
      paymentTypeId: number;
    }>;
    userId: number;
  }) {
    // Validar stock para todos los productos
    for (const detail of data.details) {
      await this.checkStock(data.warehouseId, detail.productId, detail.quantity);
    }

    // Generar número de factura
    const invoiceNumber = await this.generateInvoiceNumber();

    // Procesar conversión de monedas
    let subtotal = 0;

    const detailsWithConversion = await Promise.all(
      data.details.map(async (detail) => {
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, detail.productId));

        if (!product) {
          throw new NotFoundError(`Producto con ID ${detail.productId} no encontrado`);
        }

        const productCurrencyId = product.currencyId;
        let convertedUnitPrice = detail.unitPrice;
        let exchangeRateUsed = null;

        if (productCurrencyId !== data.currencyId) {
          exchangeRateUsed = await this.getExchangeRate(
            productCurrencyId,
            data.currencyId,
            data.date
          );
          convertedUnitPrice = detail.unitPrice * (exchangeRateUsed || 1);
        }

        const lineSubtotal = convertedUnitPrice * detail.quantity;
        subtotal += lineSubtotal;

        return {
          productId: detail.productId,
          quantity: detail.quantity.toString(),
          unitPrice: detail.unitPrice.toString(),
          paymentTypeId: detail.paymentTypeId,
          originalCurrencyId: productCurrencyId,
          exchangeRateUsed: exchangeRateUsed?.toString() || null,
          convertedUnitPrice: convertedUnitPrice.toString(),
          subtotal: lineSubtotal.toString(),
        };
      })
    );

    // Crear factura
    const [sale] = (await db.insert(sales).values({
      invoiceNumber,
      customerName: data.customerName || null,
      customerPhone: data.customerPhone || null,
      date: new Date(normalizeBusinessDate(data.date)),
      warehouseId: data.warehouseId,
      currencyId: data.currencyId,
      status: "PENDING",
      subtotal: subtotal.toString(),
      total: subtotal.toString(),
      notes: data.notes || null,
      createdBy: data.userId,
    })) as any;

    const saleId = sale.insertId;

    // Insertar detalles
    await db.insert(salesDetail).values(
      detailsWithConversion.map((detail) => ({
        saleId,
        ...detail,
      }))
    );

    return { id: saleId, invoiceNumber, subtotal, total: subtotal };
  }

  // Obtener todas las ventas
  async getAllSales() {
    return await db.select().from(sales).orderBy(desc(sales.createdAt));
  }

  // Obtener venta por ID con detalles
  async getSaleById(id: number) {
    const [sale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, id));

    if (!sale) {
      throw new NotFoundError("Factura de venta no encontrada");
    }

    const details = await db
      .select({
        id: salesDetail.id,
        productId: salesDetail.productId,
        productName: products.name,
        quantity: salesDetail.quantity,
        unitPrice: salesDetail.unitPrice,
        paymentTypeId: salesDetail.paymentTypeId,
        originalCurrencyId: salesDetail.originalCurrencyId,
        exchangeRateUsed: salesDetail.exchangeRateUsed,
        convertedUnitPrice: salesDetail.convertedUnitPrice,
        subtotal: salesDetail.subtotal,
      })
      .from(salesDetail)
      .innerJoin(products, eq(salesDetail.productId, products.id))
      .where(eq(salesDetail.saleId, id));

    return { ...sale, details };
  }

  // Aceptar factura de venta
  async acceptSale(id: number, userId: number) {
    const sale = await this.getSaleById(id);

    if (sale.status !== "PENDING") {
      throw new ValidationError("Solo se pueden aceptar facturas en estado PENDING");
    }

    // Revalidar stock al momento de aceptar
    for (const detail of sale.details) {
      await this.checkStock(sale.warehouseId, detail.productId, parseFloat(detail.quantity));
    }

    // Actualizar estado de factura
    await db
      .update(sales)
      .set({
        status: "APPROVED",
        acceptedBy: userId,
        acceptedAt: new Date(),
      })
      .where(eq(sales.id, id));

    // Crear movimientos y actualizar inventario
    for (const detail of sale.details) {
      await db.insert(inventoryMovements).values({
        type: "SALE_EXIT",
        status: "APPROVED",
        warehouseId: sale.warehouseId,
        productId: detail.productId,
        quantity: detail.quantity,
        reference: sale.invoiceNumber,
        reason: `Salida por venta ${sale.invoiceNumber}`,
      });

      await this.updateInventory(
        sale.warehouseId,
        detail.productId,
        -parseFloat(detail.quantity)
      );
    }

    return { message: "Factura de venta aceptada exitosamente" };
  }

  // Cancelar factura de venta
  async cancelSale(id: number, cancellationReason: string, userId: number) {
    const sale = await this.getSaleById(id);

    if (sale.status === "CANCELLED") {
      throw new ConflictError("La factura ya está cancelada");
    }

    const wasApproved = sale.status === "APPROVED";

    await db
      .update(sales)
      .set({
        status: "CANCELLED",
        cancellationReason,
        cancelledBy: userId,
        cancelledAt: new Date(),
      })
      .where(eq(sales.id, id));

    // Si estaba aprobada, revertir inventario
    if (wasApproved) {
      for (const detail of sale.details) {
        await db.insert(inventoryMovements).values({
          type: "ADJUSTMENT_ENTRY",
          status: "APPROVED",
          warehouseId: sale.warehouseId,
          productId: detail.productId,
          quantity: detail.quantity,
          reference: sale.invoiceNumber,
          reason: `Reversión por cancelación de venta ${sale.invoiceNumber}: ${cancellationReason}`,
        });

        await this.updateInventory(
          sale.warehouseId,
          detail.productId,
          parseFloat(detail.quantity)
        );
      }
    }

    return { message: "Factura cancelada exitosamente" };
  }

  // Reporte de ventas diarias
  async getDailySalesReport(date: string) {
    return await db
      .select()
      .from(sales)
      .where(and(sql`${sales.date} = ${date}`, eq(sales.status, "APPROVED")))
      .orderBy(desc(sales.acceptedAt));
  }

  // Reporte de ventas canceladas
  async getCancelledSalesReport(startDate?: string, endDate?: string) {
    const conditions = [eq(sales.status, "CANCELLED")];

    if (startDate) {
      conditions.push(gte(sales.cancelledAt, sql`${startDate}`));
    }

    if (endDate) {
      conditions.push(lte(sales.cancelledAt, sql`${endDate}`));
    }

    return await db
      .select()
      .from(sales)
      .where(and(...conditions))
      .orderBy(desc(sales.cancelledAt));
  }

  // Reporte de ventas totales con conversión de moneda
  async getSalesTotalsReport(
    userId: number,
    startDate: string,
    endDate: string,
    targetCurrencyId: number
  ) {
    // Obtener almacenes del usuario
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    const warehouseIds = userWarehousesData.map((w) => w.warehouseId);

    if (warehouseIds.length === 0) {
      return {
        period: { startDate, endDate },
        targetCurrency: null,
        byWarehouse: [],
        overall: {
          totalInvoices: 0,
          totalInTargetCurrency: "0.00",
          byCurrency: [],
        },
      };
    }

    // Obtener todas las ventas aprobadas en el período de los almacenes del usuario
    const salesData = await db
      .select({
        saleId: sales.id,
        invoiceNumber: sales.invoiceNumber,
        date: sales.date,
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        currencyId: sales.currencyId,
        currencyCode: currencies.code,
        total: sales.total,
        createdBy: sales.createdBy,
        createdByName: users.nombre,
      })
      .from(sales)
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(sales.currencyId, currencies.id))
      .innerJoin(users, eq(sales.createdBy, users.id))
      .where(
        and(
          eq(sales.status, "APPROVED"),
          inArray(sales.warehouseId, warehouseIds),
          gte(sales.date, sql`${startDate}`),
          lte(sales.date, sql`${endDate}`)
        )
      );

    // Obtener moneda objetivo
    const [targetCurrency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.id, targetCurrencyId));

    // Agrupar por almacén
    const byWarehouse: any[] = [];
    const warehouseMap = new Map<number, any>();

    for (const sale of salesData) {
      if (!warehouseMap.has(sale.warehouseId)) {
        warehouseMap.set(sale.warehouseId, {
          warehouseId: sale.warehouseId,
          warehouseName: sale.warehouseName,
          invoiceCount: 0,
          byCurrency: new Map<string, { currency: string; code: string; total: number }>(),
          totalInTargetCurrency: 0,
        });
      }

      const warehouse = warehouseMap.get(sale.warehouseId);
      warehouse.invoiceCount++;

      // Acumular por moneda
      const currencyKey = sale.currencyCode;
      if (!warehouse.byCurrency.has(currencyKey)) {
        warehouse.byCurrency.set(currencyKey, {
          currency: sale.currencyCode,
          code: sale.currencyCode,
          total: 0,
        });
      }
      warehouse.byCurrency.get(currencyKey).total += parseFloat(sale.total);

      // Convertir a moneda objetivo
      let convertedTotal = parseFloat(sale.total);
      if (sale.currencyId !== targetCurrencyId) {
        const saleDate = typeof sale.date === 'string' ? sale.date : sale.date.toISOString().split('T')[0];
        const rate = await this.getExchangeRate(
          sale.currencyId,
          targetCurrencyId,
          saleDate
        );
        if (rate) {
          convertedTotal = parseFloat(sale.total) * rate;
        }
      }
      warehouse.totalInTargetCurrency += convertedTotal;
    }

    // Construir resultado por almacén
    for (const [_, warehouse] of warehouseMap) {
      byWarehouse.push({
        warehouseId: warehouse.warehouseId,
        warehouseName: warehouse.warehouseName,
        invoiceCount: warehouse.invoiceCount,
        byCurrency: Array.from(warehouse.byCurrency.values()).map((c: any) => ({
          currency: c.currency,
          code: c.code,
          total: c.total.toFixed(2),
        })),
        totalInTargetCurrency: warehouse.totalInTargetCurrency.toFixed(2),
      });
    }

    // Calcular totales generales
    const overallByCurrency = new Map<string, { currency: string; total: number }>();
    let overallTotal = 0;

    for (const warehouse of byWarehouse) {
      for (const curr of warehouse.byCurrency) {
        if (!overallByCurrency.has(curr.code)) {
          overallByCurrency.set(curr.code, {
            currency: curr.code,
            total: 0,
          });
        }
        overallByCurrency.get(curr.code)!.total += parseFloat(curr.total);
      }
      overallTotal += parseFloat(warehouse.totalInTargetCurrency);
    }

    return {
      period: { startDate, endDate },
      targetCurrency: targetCurrency
        ? { id: targetCurrency.id, code: targetCurrency.code, name: targetCurrency.name }
        : null,
      byWarehouse,
      overall: {
        totalInvoices: salesData.length,
        byCurrency: Array.from(overallByCurrency.values()).map((c) => ({
          currency: c.currency,
          total: c.total.toFixed(2),
        })),
        totalInTargetCurrency: overallTotal.toFixed(2),
      },
    };
  }

  // Actualizar inventario
  private async updateInventory(
    warehouseId: number,
    productId: number,
    quantityChange: number
  ) {
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
      const newQuantity =
        parseFloat(existingStock.currentQuantity) + quantityChange;

      await db
        .update(inventory)
        .set({ currentQuantity: newQuantity.toString() })
        .where(eq(inventory.id, existingStock.id));
    } else {
      await db.insert(inventory).values({
        warehouseId,
        productId,
        currentQuantity: quantityChange.toString(),
      });
    }
  }
}

