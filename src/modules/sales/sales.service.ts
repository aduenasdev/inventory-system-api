import { db } from "../../db/connection";
import { sales } from "../../db/schema/sales";
import { salesDetail } from "../../db/schema/sales_detail";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { products } from "../../db/schema/products";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { lotConsumptions } from "../../db/schema/lot_consumptions";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { users } from "../../db/schema/users";
import { paymentTypes } from "../../db/schema/payment_types";
import { eq, and, sql, desc, gte, lte, inArray, or, aliasedTable } from "drizzle-orm";
import { normalizeBusinessDate, getTodayDateString } from "../../utils/date";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";
import { lotService } from "../inventory/lots.service";

const BASE_CURRENCY_ID = 1;

// Alias para usuarios (múltiples joins a la misma tabla)
const createdByUser = aliasedTable(users, "created_by_user");
const acceptedByUser = aliasedTable(users, "accepted_by_user");
const cancelledByUser = aliasedTable(users, "cancelled_by_user");
const paidByUser = aliasedTable(users, "paid_by_user");

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
  // Las tasas se guardan como CUP (1) → X, así que manejamos ambas direcciones
  private async getExchangeRate(fromCurrencyId: number, toCurrencyId: number, date: string): Promise<number | null> {
    if (fromCurrencyId === toCurrencyId) {
      return null;
    }

    // Caso 1: Buscamos X → CUP (necesitamos inverso de CUP → X)
    if (toCurrencyId === BASE_CURRENCY_ID) {
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
          `No existe tasa de cambio para la fecha ${date} de la moneda ID ${fromCurrencyId} a CUP. Debe crearla antes de continuar.`
        );
      }

      const rateValue = parseFloat(rate.rate);
      return rateValue !== 0 ? 1 / rateValue : null;
    }

    // Caso 2: Buscamos CUP → X (directo)
    if (fromCurrencyId === BASE_CURRENCY_ID) {
      const [rate] = await db
        .select()
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.fromCurrencyId, BASE_CURRENCY_ID),
            eq(exchangeRates.toCurrencyId, toCurrencyId),
            sql`DATE(${exchangeRates.date}) = ${date}`
          )
        );

      if (!rate) {
        throw new NotFoundError(
          `No existe tasa de cambio para la fecha ${date} de CUP a la moneda ID ${toCurrencyId}. Debe crearla antes de continuar.`
        );
      }

      return parseFloat(rate.rate);
    }

    // Caso 3: X → Y (ambas diferentes de CUP) - convertir via CUP
    const rateXtoCUP: number | null = await this.getExchangeRate(fromCurrencyId, BASE_CURRENCY_ID, date);
    const rateCUPtoY: number | null = await this.getExchangeRate(BASE_CURRENCY_ID, toCurrencyId, date);
    
    if (rateXtoCUP && rateCUPtoY) {
      return rateXtoCUP * rateCUPtoY;
    }

    throw new NotFoundError(
      `No existe tasa de cambio para la fecha ${date} entre las monedas especificadas. Debe crearla antes de continuar.`
    );
  }

  // Verificar stock disponible (desde lotes)
  private async checkStock(warehouseId: number, productId: number, quantity: number) {
    const availableStock = await lotService.getStockFromLots(warehouseId, productId);

    if (availableStock < quantity) {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));
      throw new ValidationError(
        `Stock insuficiente para el producto "${product.name}". Disponible: ${availableStock.toFixed(4)}, Solicitado: ${quantity}`
      );
    }
  }

  // Crear factura de venta
  async createSale(data: {
    customerName?: string;
    customerPhone?: string;
    warehouseId: number;
    currencyId: number;
    notes?: string;
    autoApprove?: boolean;
    details: Array<{
      productId: number;
      quantity: number;
      unitPrice: number;
      paymentTypeId: number;
    }>;
    userId: number;
    userPermissions: string[];
  }) {
    // Verificar si puede auto-aprobar
    const canAutoApprove = data.autoApprove && data.userPermissions.includes("sales.accept");

    // Validar stock para todos los productos
    for (const detail of data.details) {
      await this.checkStock(data.warehouseId, detail.productId, detail.quantity);
    }

    // Generar número de factura
    const invoiceNumber = await this.generateInvoiceNumber();
    
    // Usar fecha actual del servidor (zona horaria local)
    const normalizedDate = getTodayDateString();

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

        // Validar paymentType
        const [paymentType] = await db
          .select()
          .from(paymentTypes)
          .where(eq(paymentTypes.id, detail.paymentTypeId));

        if (!paymentType) {
          throw new NotFoundError(`Tipo de pago con ID ${detail.paymentTypeId} no encontrado`);
        }

        const productCurrencyId = product.currencyId;
        let convertedUnitPrice = detail.unitPrice;
        let exchangeRateUsed = null;

        if (productCurrencyId !== data.currencyId) {
          exchangeRateUsed = await this.getExchangeRate(
            productCurrencyId,
            data.currencyId,
            normalizedDate
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

    // Crear factura (PENDING o APPROVED según autoApprove)
    const [sale] = (await db.insert(sales).values({
      invoiceNumber,
      customerName: data.customerName || null,
      customerPhone: data.customerPhone || null,
      date: sql`${normalizedDate}`,
      warehouseId: data.warehouseId,
      currencyId: data.currencyId,
      status: canAutoApprove ? "APPROVED" : "PENDING",
      subtotal: subtotal.toString(),
      total: subtotal.toString(),
      notes: data.notes || null,
      createdBy: data.userId,
      acceptedBy: canAutoApprove ? data.userId : null,
      acceptedAt: canAutoApprove ? new Date() : null,
    })) as any;

    const saleId = sale.insertId;

    // Insertar detalles
    await db.insert(salesDetail).values(
      detailsWithConversion.map((detail) => ({
        saleId,
        ...detail,
      }))
    );

    // Si es auto-aprobada, consumir lotes inmediatamente
    if (canAutoApprove) {
      const saleData = await this.getSaleByIdInternal(saleId);
      await this.processApprovedSale(saleData);
    }

    return { 
      id: saleId, 
      invoiceNumber, 
      subtotal, 
      total: subtotal,
      status: canAutoApprove ? "APPROVED" : "PENDING"
    };
  }

  // Procesar venta aprobada (consumir lotes y calcular costos)
  private async processApprovedSale(sale: any) {
    for (const detail of sale.details) {
      const quantity = parseFloat(detail.quantity);
      const unitPrice = parseFloat(detail.convertedUnitPrice || detail.unitPrice);
      const revenue = unitPrice * quantity;

      // Consumir lotes FIFO
      const consumeResult = await lotService.consumeLotsFromWarehouse(
        sale.warehouseId,
        detail.productId,
        quantity,
        "SALE",
        "sales_detail",
        detail.id
      );

      const realCost = consumeResult.totalCost;
      const margin = revenue - realCost;

      // Actualizar detalle con costo real y margen
      await db
        .update(salesDetail)
        .set({
          realCost: realCost.toString(),
          margin: margin.toString(),
        })
        .where(eq(salesDetail.id, detail.id));

      // Crear movimiento de inventario (para auditoría general)
      await db.insert(inventoryMovements).values({
        type: "SALE_EXIT",
        status: "APPROVED",
        warehouseId: sale.warehouseId,
        productId: detail.productId,
        quantity: detail.quantity,
        reference: sale.invoiceNumber,
        reason: `Salida por venta ${sale.invoiceNumber}. Costo real: ${realCost.toFixed(4)}, Margen: ${margin.toFixed(4)}`,
      });
    }
  }

  // Query base con JOINs para obtener nombres de usuarios, almacén y moneda (para listados)
  private async getSalesWithUserNames(whereCondition: any) {
    return await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        customerName: sales.customerName,
        customerPhone: sales.customerPhone,
        date: sales.date,
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        currencyId: sales.currencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        status: sales.status,
        cancellationReason: sales.cancellationReason,
        subtotal: sales.subtotal,
        total: sales.total,
        notes: sales.notes,
        isPaid: sales.isPaid,
        paidBy: sales.paidBy,
        paidByName: sql<string>`CONCAT(${paidByUser.nombre}, ' ', COALESCE(${paidByUser.apellido}, ''))`.as('paid_by_name'),
        paidAt: sales.paidAt,
        createdBy: sales.createdBy,
        createdByName: sql<string>`CONCAT(${createdByUser.nombre}, ' ', COALESCE(${createdByUser.apellido}, ''))`.as('created_by_name'),
        acceptedBy: sales.acceptedBy,
        acceptedByName: sql<string>`CONCAT(${acceptedByUser.nombre}, ' ', COALESCE(${acceptedByUser.apellido}, ''))`.as('accepted_by_name'),
        cancelledBy: sales.cancelledBy,
        cancelledByName: sql<string>`CONCAT(${cancelledByUser.nombre}, ' ', COALESCE(${cancelledByUser.apellido}, ''))`.as('cancelled_by_name'),
        createdAt: sales.createdAt,
        updatedAt: sales.updatedAt,
        acceptedAt: sales.acceptedAt,
        cancelledAt: sales.cancelledAt,
      })
      .from(sales)
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(sales.currencyId, currencies.id))
      .innerJoin(createdByUser, eq(sales.createdBy, createdByUser.id))
      .leftJoin(acceptedByUser, eq(sales.acceptedBy, acceptedByUser.id))
      .leftJoin(cancelledByUser, eq(sales.cancelledBy, cancelledByUser.id))
      .leftJoin(paidByUser, eq(sales.paidBy, paidByUser.id))
      .where(whereCondition)
      .orderBy(desc(sales.createdAt));
  }

  // Obtener ventas filtradas según permisos del usuario y rango de fechas
  async getAllSales(
    userId: number,
    userPermissions: string[],
    startDate: string,
    endDate: string,
    warehouseId?: number,
    status?: 'PENDING' | 'APPROVED' | 'CANCELLED',
    isPaid?: boolean
  ) {
    const hasReadAll = userPermissions.includes("sales.read");
    const hasCancel = userPermissions.includes("sales.cancel");
    const hasAccept = userPermissions.includes("sales.accept");
    const hasCreate = userPermissions.includes("sales.create");
    const hasPaid = userPermissions.includes("sales.paid");

    // Condiciones base
    const baseConditions: any[] = [
      gte(sales.date, sql`${startDate}`),
      lte(sales.date, sql`${endDate}`)
    ];

    // Filtro opcional por almacén
    if (warehouseId) {
      baseConditions.push(eq(sales.warehouseId, warehouseId));
    }

    // Filtro opcional por estado (solo si tiene permiso para ver ese estado)
    if (status) {
      baseConditions.push(eq(sales.status, status));
    }

    // Filtro por isPaid (solo si tiene permiso sales.paid)
    if (isPaid !== undefined && hasPaid) {
      baseConditions.push(eq(sales.isPaid, isPaid));
    }

    const baseCondition = and(...baseConditions);

    // Si tiene sales.read → ve TODAS (dentro del rango y filtros)
    if (hasReadAll) {
      return await this.getSalesWithUserNames(baseCondition);
    }

    // Construir condiciones según permisos
    const permissionConditions: any[] = [];

    // Si tiene sales.cancel → ve PENDING + APPROVED
    if (hasCancel) {
      permissionConditions.push(
        inArray(sales.status, ["PENDING", "APPROVED"])
      );
    }

    // Si tiene sales.accept → ve PENDING
    if (hasAccept && !hasCancel) {
      permissionConditions.push(eq(sales.status, "PENDING"));
    }

    // Si solo tiene sales.create → ve solo las suyas
    if (hasCreate) {
      permissionConditions.push(eq(sales.createdBy, userId));
    }

    // Si no tiene ningún permiso relevante, retornar vacío
    if (permissionConditions.length === 0) {
      return [];
    }

    // Combinar: (permisos OR) AND (condiciones base)
    return await this.getSalesWithUserNames(
      and(baseCondition, or(...permissionConditions))
    );
  }

  // Obtener venta por ID (uso interno para operaciones)
  private async getSaleByIdInternal(id: number) {
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
        realCost: salesDetail.realCost,
        margin: salesDetail.margin,
      })
      .from(salesDetail)
      .innerJoin(products, eq(salesDetail.productId, products.id))
      .where(eq(salesDetail.saleId, id));

    return { ...sale, details };
  }

  // Obtener venta por ID con detalles (para API externa, con nombres de usuarios)
  async getSaleById(id: number) {
    const results = await this.getSalesWithUserNames(eq(sales.id, id));
    
    const sale = results[0];

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
        paymentTypeName: paymentTypes.type,
        originalCurrencyId: salesDetail.originalCurrencyId,
        exchangeRateUsed: salesDetail.exchangeRateUsed,
        convertedUnitPrice: salesDetail.convertedUnitPrice,
        subtotal: salesDetail.subtotal,
        realCost: salesDetail.realCost,
        margin: salesDetail.margin,
      })
      .from(salesDetail)
      .innerJoin(products, eq(salesDetail.productId, products.id))
      .innerJoin(paymentTypes, eq(salesDetail.paymentTypeId, paymentTypes.id))
      .where(eq(salesDetail.saleId, id));

    return Object.assign({}, sale, { details });
  }

  // Aceptar factura de venta (consume lotes FIFO y calcula costo real)
  async acceptSale(id: number, userId: number) {
    const sale = await this.getSaleByIdInternal(id);

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

    // Procesar la venta (consumir lotes y calcular costos)
    await this.processApprovedSale(sale);

    return { message: "Factura de venta aceptada exitosamente. Lotes consumidos con FIFO." };
  }

  // Cancelar factura de venta
  async cancelSale(id: number, cancellationReason: string, userId: number) {
    const sale = await this.getSaleByIdInternal(id);

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

    // Si estaba aprobada, recrear lotes con el mismo costo
    if (wasApproved) {
      for (const detail of sale.details) {
        // Obtener los consumos originales de esta línea
        const consumptions = await db
          .select({
            lotId: lotConsumptions.lotId,
            quantity: lotConsumptions.quantity,
            unitCost: lotConsumptions.unitCostAtConsumption,
            lotCode: inventoryLots.lotCode,
            originalCurrencyId: inventoryLots.originalCurrencyId,
            originalUnitCost: inventoryLots.originalUnitCost,
            exchangeRate: inventoryLots.exchangeRate,
            entryDate: inventoryLots.entryDate,
          })
          .from(lotConsumptions)
          .innerJoin(inventoryLots, eq(lotConsumptions.lotId, inventoryLots.id))
          .where(
            and(
              eq(lotConsumptions.referenceType, "sales_detail"),
              eq(lotConsumptions.referenceId, detail.id)
            )
          );

        // Por cada consumo, crear un lote de devolución con el mismo costo
        for (const consumption of consumptions) {
          const quantity = parseFloat(consumption.quantity);

          // Crear lote de devolución
          await lotService.createLot({
            productId: detail.productId,
            warehouseId: sale.warehouseId,
            quantity,
            originalCurrencyId: consumption.originalCurrencyId,
            originalUnitCost: parseFloat(consumption.originalUnitCost),
            exchangeRate: parseFloat(consumption.exchangeRate),
            sourceType: "ADJUSTMENT",
            sourceId: id,
            entryDate: getTodayDateString(),
          });

          // Crear movimiento de reversión
          await db.insert(inventoryMovements).values({
            type: "ADJUSTMENT_ENTRY",
            status: "APPROVED",
            warehouseId: sale.warehouseId,
            productId: detail.productId,
            quantity: consumption.quantity,
            reference: sale.invoiceNumber,
            reason: `Devolución por cancelación de venta ${sale.invoiceNumber}: ${cancellationReason}. Lote original: ${consumption.lotCode}`,
          });
        }
      }
    }

    return { message: "Factura cancelada exitosamente" };
  }

  // Marcar venta como pagada/cobrada (no afecta inventario)
  async markSaleAsPaid(id: number, userId: number) {
    const [sale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, id));

    if (!sale) {
      throw new NotFoundError("Factura de venta no encontrada");
    }

    if (sale.status !== "APPROVED") {
      throw new ValidationError("Solo se pueden marcar como pagadas facturas en estado APPROVED");
    }

    if (sale.isPaid) {
      throw new ConflictError("La factura ya está marcada como pagada");
    }

    await db
      .update(sales)
      .set({
        isPaid: true,
        paidBy: userId,
        paidAt: new Date(),
      })
      .where(eq(sales.id, id));

    return { message: "Factura marcada como pagada exitosamente" };
  }

  // Reporte de ventas con margen real
  async getSalesMarginReport(startDate: string, endDate: string, warehouseId?: number) {
    const conditions: any[] = [
      eq(sales.status, "APPROVED"),
      gte(sales.date, sql`${startDate}`),
      lte(sales.date, sql`${endDate}`)
    ];

    if (warehouseId) {
      conditions.push(eq(sales.warehouseId, warehouseId));
    }

    const salesData = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        date: sales.date,
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        total: sales.total,
        customerName: sales.customerName,
        isPaid: sales.isPaid,
      })
      .from(sales)
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .where(and(...conditions))
      .orderBy(desc(sales.date));

    // Calcular totales de cada venta
    const salesWithTotals = await Promise.all(
      salesData.map(async (sale) => {
        const details = await db
          .select({
            subtotal: salesDetail.subtotal,
            realCost: salesDetail.realCost,
            margin: salesDetail.margin,
          })
          .from(salesDetail)
          .where(eq(salesDetail.saleId, sale.id));

        const totalRevenue = details.reduce((sum, d) => sum + parseFloat(d.subtotal), 0);
        const totalCost = details.reduce((sum, d) => sum + parseFloat(d.realCost || "0"), 0);
        const totalMargin = details.reduce((sum, d) => sum + parseFloat(d.margin || "0"), 0);
        const marginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

        return {
          ...sale,
          totalRevenue: totalRevenue.toFixed(4),
          totalCost: totalCost.toFixed(4),
          totalMargin: totalMargin.toFixed(4),
          marginPercent: marginPercent.toFixed(2) + "%",
        };
      })
    );

    // Totales generales
    const overallRevenue = salesWithTotals.reduce((sum, s) => sum + parseFloat(s.totalRevenue), 0);
    const overallCost = salesWithTotals.reduce((sum, s) => sum + parseFloat(s.totalCost), 0);
    const overallMargin = salesWithTotals.reduce((sum, s) => sum + parseFloat(s.totalMargin), 0);
    const overallMarginPercent = overallRevenue > 0 ? (overallMargin / overallRevenue) * 100 : 0;

    return {
      sales: salesWithTotals,
      summary: {
        totalSales: salesWithTotals.length,
        totalRevenue: overallRevenue.toFixed(4),
        totalCost: overallCost.toFixed(4),
        totalMargin: overallMargin.toFixed(4),
        marginPercent: overallMarginPercent.toFixed(2) + "%",
      },
    };
  }

  // Obtener consumos de lotes de una venta
  async getSaleLotConsumptions(saleId: number) {
    const sale = await this.getSaleByIdInternal(saleId);
    
    const allConsumptions = [];
    
    for (const detail of sale.details) {
      const consumptions = await db
        .select({
          detailId: salesDetail.id,
          productId: salesDetail.productId,
          productName: products.name,
          lotId: lotConsumptions.lotId,
          lotCode: inventoryLots.lotCode,
          quantityConsumed: lotConsumptions.quantity,
          unitCost: lotConsumptions.unitCostAtConsumption,
          totalCost: lotConsumptions.totalCost,
          lotEntryDate: inventoryLots.entryDate,
        })
        .from(lotConsumptions)
        .innerJoin(inventoryLots, eq(lotConsumptions.lotId, inventoryLots.id))
        .innerJoin(salesDetail, eq(lotConsumptions.referenceId, salesDetail.id))
        .innerJoin(products, eq(salesDetail.productId, products.id))
        .where(
          and(
            eq(lotConsumptions.referenceType, "sales_detail"),
            eq(lotConsumptions.referenceId, detail.id)
          )
        );
      
      allConsumptions.push(...consumptions);
    }
    
    return {
      sale: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        date: sale.date,
      },
      consumptions: allConsumptions,
    };
  }

  // Reporte de facturas canceladas
  async getCancelledSalesReport(startDate: string, endDate: string) {
    const conditions = [
      eq(sales.status, "CANCELLED"),
      gte(sales.cancelledAt, sql`${startDate}`),
      lte(sales.cancelledAt, sql`${endDate}`)
    ];

    return await this.getSalesWithUserNames(and(...conditions));
  }

  // Reporte de ventas diarias
  async getDailySalesReport(date: string) {
    const normalizedDate = normalizeBusinessDate(date);
    
    const dailySales = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        customerName: sales.customerName,
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        currencyId: sales.currencyId,
        currencyCode: currencies.code,
        total: sales.total,
        status: sales.status,
        isPaid: sales.isPaid,
        createdAt: sales.createdAt,
      })
      .from(sales)
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(sales.currencyId, currencies.id))
      .where(
        and(
          sql`DATE(${sales.date}) = ${normalizedDate}`,
          eq(sales.status, "APPROVED")
        )
      )
      .orderBy(desc(sales.createdAt));

    // Calcular totales
    const totalSales = dailySales.length;
    const totalRevenue = dailySales.reduce((sum, s) => sum + parseFloat(s.total), 0);
    const paidSales = dailySales.filter(s => s.isPaid).length;
    const unpaidSales = dailySales.filter(s => !s.isPaid).length;

    return {
      date: normalizedDate,
      sales: dailySales,
      summary: {
        totalSales,
        totalRevenue: totalRevenue.toFixed(4),
        paidSales,
        unpaidSales,
      },
    };
  }

  // Reporte de totales de ventas por período
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

    const allowedWarehouseIds = userWarehousesData.map((w) => w.warehouseId);

    if (allowedWarehouseIds.length === 0) {
      return {
        startDate,
        endDate,
        targetCurrency: null,
        sales: [],
        summary: { totalSales: 0, totalRevenue: "0.0000", paidSales: 0, unpaidSales: 0 },
      };
    }

    const [targetCurrency] = await db
      .select()
      .from(currencies)
      .where(eq(currencies.id, targetCurrencyId));

    const periodSales = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        date: sales.date,
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        currencyId: sales.currencyId,
        currencyCode: currencies.code,
        total: sales.total,
        status: sales.status,
        isPaid: sales.isPaid,
      })
      .from(sales)
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(sales.currencyId, currencies.id))
      .where(
        and(
          inArray(sales.warehouseId, allowedWarehouseIds),
          eq(sales.status, "APPROVED"),
          gte(sales.date, sql`${startDate}`),
          lte(sales.date, sql`${endDate}`)
        )
      )
      .orderBy(desc(sales.date));

    // Convertir totales a moneda objetivo
    let totalRevenueConverted = 0;

    const salesWithConversion = await Promise.all(
      periodSales.map(async (sale) => {
        let convertedTotal = parseFloat(sale.total);
        
        if (sale.currencyId !== targetCurrencyId) {
          // Buscar tasa de cambio
          const saleDate = normalizeBusinessDate(sale.date);
          const rate = await this.getExchangeRate(sale.currencyId, targetCurrencyId, saleDate);
          if (rate) {
            convertedTotal = parseFloat(sale.total) * rate;
          }
        }
        
        totalRevenueConverted += convertedTotal;
        
        return {
          ...sale,
          convertedTotal: convertedTotal.toFixed(4),
        };
      })
    );

    const paidSales = periodSales.filter(s => s.isPaid).length;
    const unpaidSales = periodSales.filter(s => !s.isPaid).length;

    return {
      startDate,
      endDate,
      targetCurrency: targetCurrency?.code || null,
      sales: salesWithConversion,
      summary: {
        totalSales: periodSales.length,
        totalRevenue: totalRevenueConverted.toFixed(4),
        paidSales,
        unpaidSales,
      },
    };
  }
}
