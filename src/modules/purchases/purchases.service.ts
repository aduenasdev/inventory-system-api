import { db } from "../../db/connection";
import { purchases } from "../../db/schema/purchases";
import { purchasesDetail } from "../../db/schema/purchases_detail";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { products } from "../../db/schema/products";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { users } from "../../db/schema/users";
import { warehouses } from "../../db/schema/warehouses";
import { currencies } from "../../db/schema/currencies";
import { eq, and, sql, desc, gte, lte, or, inArray, aliasedTable } from "drizzle-orm";
import { normalizeBusinessDate, getTodayDateString } from "../../utils/date";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";
import { lotService } from "../inventory/lots.service";

// ID de la moneda base (CUP)
const BASE_CURRENCY_ID = 1;

// Alias para usuarios (múltiples joins a la misma tabla)
const createdByUser = aliasedTable(users, "created_by_user");
const acceptedByUser = aliasedTable(users, "accepted_by_user");
const cancelledByUser = aliasedTable(users, "cancelled_by_user");

export class PurchasesService {
  // Generar número de factura auto-incremental
  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const [lastPurchase] = await db
      .select()
      .from(purchases)
      .where(sql`invoice_number LIKE ${`FC-${year}%`}`)
      .orderBy(desc(purchases.id))
      .limit(1);

    let nextNumber = 1;
    if (lastPurchase) {
      const lastNumber = parseInt(lastPurchase.invoiceNumber.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    return `FC-${year}-${nextNumber.toString().padStart(5, "0")}`;
  }

  // Obtener tasa de cambio del día (de moneda origen a CUP)
  // Las tasas se guardan como CUP → X, así que buscamos CUP → fromCurrency y calculamos el inverso
  private async getExchangeRateToCUP(fromCurrencyId: number, date: string): Promise<number> {
    if (fromCurrencyId === BASE_CURRENCY_ID) {
      return 1; // Ya está en CUP
    }

    // Buscar tasa CUP → fromCurrency (así es como se guardan)
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

    // La tasa guardada es CUP → X (ej: 1 CUP = 0.0025 USD)
    // Necesitamos X → CUP, así que calculamos el inverso (ej: 1 USD = 400 CUP)
    const rateValue = parseFloat(rate.rate);
    if (rateValue === 0) {
      throw new ValidationError("La tasa de cambio no puede ser cero");
    }
    
    return 1 / rateValue;
  }

  // Crear factura de compra
  async createPurchase(data: {
    supplierName?: string;
    supplierPhone?: string;
    warehouseId: number;
    currencyId: number;
    notes?: string;
    autoApprove?: boolean;
    details: Array<{
      productId: number;
      quantity: number;
      unitCost: number;
    }>;
    userId: number;
    userPermissions: string[];
  }) {
    // Verificar si puede auto-aprobar
    const canAutoApprove = data.autoApprove && data.userPermissions.includes("purchases.accept");
    
    // Generar número de factura
    const invoiceNumber = await this.generateInvoiceNumber();
    
    // Usar fecha actual del servidor (zona horaria local)
    const normalizedDate = getTodayDateString();

    // Obtener tasa de cambio de la moneda de la factura a CUP
    const exchangeRateToCUP = await this.getExchangeRateToCUP(data.currencyId, normalizedDate);

    let subtotal = 0;

    const detailsProcessed = await Promise.all(
      data.details.map(async (detail) => {
        // Obtener producto para validar
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, detail.productId));

        if (!product) {
          throw new NotFoundError(`Producto con ID ${detail.productId} no encontrado`);
        }

        // El costo convertido a CUP
        const convertedUnitCost = detail.unitCost * exchangeRateToCUP;
        const lineSubtotal = detail.unitCost * detail.quantity;
        subtotal += lineSubtotal;

        return {
          productId: detail.productId,
          quantity: detail.quantity.toString(),
          unitCost: detail.unitCost.toString(),
          originalCurrencyId: data.currencyId,
          exchangeRateUsed: exchangeRateToCUP.toString(),
          convertedUnitCost: convertedUnitCost.toString(),
          subtotal: lineSubtotal.toString(),
        };
      })
    );

    // Crear factura (PENDING o APPROVED según autoApprove)
    const [purchase] = (await db.insert(purchases).values({
      invoiceNumber,
      supplierName: data.supplierName || null,
      supplierPhone: data.supplierPhone || null,
      date: sql`${normalizedDate}`, // Fecha como string SQL directo
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

    const purchaseId = purchase.insertId;

    // Insertar detalles
    await db.insert(purchasesDetail).values(
      detailsProcessed.map((detail) => ({
        purchaseId,
        ...detail,
      }))
    );

    // Si es auto-aprobada, crear lotes y movimientos inmediatamente
    if (canAutoApprove) {
      let lineNumber = 1;
      for (const detail of detailsProcessed) {
        const quantity = parseFloat(detail.quantity);
        const originalUnitCost = parseFloat(detail.unitCost);
        const exchangeRate = parseFloat(detail.exchangeRateUsed);

        // Crear lote de inventario
        const lotId = await lotService.createLot({
          productId: detail.productId,
          warehouseId: data.warehouseId,
          quantity,
          originalCurrencyId: detail.originalCurrencyId,
          originalUnitCost,
          exchangeRate,
          sourceType: "PURCHASE",
          sourceId: purchaseId,
          entryDate: normalizedDate,
        }, lineNumber);

        // Actualizar el detalle con la referencia al lote
        const [detailRow] = await db
          .select()
          .from(purchasesDetail)
          .where(
            and(
              eq(purchasesDetail.purchaseId, purchaseId),
              eq(purchasesDetail.productId, detail.productId)
            )
          );
        
        if (detailRow) {
          await db
            .update(purchasesDetail)
            .set({ lotId })
            .where(eq(purchasesDetail.id, detailRow.id));
        }

        // Crear movimiento de inventario
        await db.insert(inventoryMovements).values({
          type: "INVOICE_ENTRY",
          status: "APPROVED",
          warehouseId: data.warehouseId,
          productId: detail.productId,
          quantity: detail.quantity,
          reference: invoiceNumber,
          reason: `Entrada por factura ${invoiceNumber}`,
          lotId,
        });

        lineNumber++;
      }
    }

    return { 
      id: purchaseId, 
      invoiceNumber, 
      subtotal, 
      total: subtotal,
      status: canAutoApprove ? "APPROVED" : "PENDING"
    };
  }

  // Query base con JOINs para obtener nombres de usuarios, almacén y moneda (para listados)
  private async getPurchasesWithUserNames(whereCondition: any) {
    return await db
      .select({
        id: purchases.id,
        invoiceNumber: purchases.invoiceNumber,
        supplierName: purchases.supplierName,
        supplierPhone: purchases.supplierPhone,
        date: purchases.date,
        warehouseId: purchases.warehouseId,
        warehouseName: warehouses.name,
        currencyId: purchases.currencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        status: purchases.status,
        cancellationReason: purchases.cancellationReason,
        subtotal: purchases.subtotal,
        total: purchases.total,
        notes: purchases.notes,
        createdBy: purchases.createdBy,
        createdByName: sql<string>`CONCAT(${createdByUser.nombre}, ' ', COALESCE(${createdByUser.apellido}, ''))`.as('created_by_name'),
        acceptedBy: purchases.acceptedBy,
        acceptedByName: sql<string>`CONCAT(${acceptedByUser.nombre}, ' ', COALESCE(${acceptedByUser.apellido}, ''))`.as('accepted_by_name'),
        cancelledBy: purchases.cancelledBy,
        cancelledByName: sql<string>`CONCAT(${cancelledByUser.nombre}, ' ', COALESCE(${cancelledByUser.apellido}, ''))`.as('cancelled_by_name'),
        createdAt: purchases.createdAt,
        updatedAt: purchases.updatedAt,
        acceptedAt: purchases.acceptedAt,
        cancelledAt: purchases.cancelledAt,
      })
      .from(purchases)
      .innerJoin(warehouses, eq(purchases.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(purchases.currencyId, currencies.id))
      .innerJoin(createdByUser, eq(purchases.createdBy, createdByUser.id))
      .leftJoin(acceptedByUser, eq(purchases.acceptedBy, acceptedByUser.id))
      .leftJoin(cancelledByUser, eq(purchases.cancelledBy, cancelledByUser.id))
      .where(whereCondition)
      .orderBy(desc(purchases.createdAt));
  }

  // Obtener compras filtradas según permisos del usuario y rango de fechas
  async getAllPurchases(
    userId: number, 
    userPermissions: string[], 
    startDate: string, 
    endDate: string,
    warehouseId?: number,
    status?: 'PENDING' | 'APPROVED' | 'CANCELLED'
  ) {
    const hasReadAll = userPermissions.includes("purchases.read");
    const hasCancel = userPermissions.includes("purchases.cancel");
    const hasAccept = userPermissions.includes("purchases.accept");
    const hasCreate = userPermissions.includes("purchases.create");

    // Condiciones base
    const baseConditions: any[] = [
      gte(purchases.date, sql`${startDate}`),
      lte(purchases.date, sql`${endDate}`)
    ];

    // Filtro opcional por almacén
    if (warehouseId) {
      baseConditions.push(eq(purchases.warehouseId, warehouseId));
    }

    // Filtro opcional por estado (solo si tiene permiso para ver ese estado)
    if (status) {
      baseConditions.push(eq(purchases.status, status));
    }

    const baseCondition = and(...baseConditions);

    // Si tiene purchases.read → ve TODAS (dentro del rango y filtros)
    if (hasReadAll) {
      return await this.getPurchasesWithUserNames(baseCondition);
    }

    // Construir condiciones según permisos
    const permissionConditions: any[] = [];

    // Si tiene purchases.cancel → ve PENDING + APPROVED
    if (hasCancel) {
      permissionConditions.push(
        inArray(purchases.status, ["PENDING", "APPROVED"])
      );
    }

    // Si tiene purchases.accept → ve PENDING
    if (hasAccept && !hasCancel) {
      permissionConditions.push(eq(purchases.status, "PENDING"));
    }

    // Si solo tiene purchases.create → ve solo las suyas
    if (hasCreate) {
      permissionConditions.push(eq(purchases.createdBy, userId));
    }

    // Si no tiene ningún permiso relevante, retornar vacío
    if (permissionConditions.length === 0) {
      return [];
    }

    // Combinar: (permisos OR) AND (condiciones base)
    return await this.getPurchasesWithUserNames(
      and(baseCondition, or(...permissionConditions))
    );
  }

  // Obtener compra por ID (uso interno para operaciones)
  private async getPurchaseByIdInternal(id: number) {
    const [purchase] = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, id));

    if (!purchase) {
      throw new NotFoundError("Factura de compra no encontrada");
    }

    const details = await db
      .select({
        id: purchasesDetail.id,
        productId: purchasesDetail.productId,
        productName: products.name,
        quantity: purchasesDetail.quantity,
        unitCost: purchasesDetail.unitCost,
        originalCurrencyId: purchasesDetail.originalCurrencyId,
        exchangeRateUsed: purchasesDetail.exchangeRateUsed,
        convertedUnitCost: purchasesDetail.convertedUnitCost,
        subtotal: purchasesDetail.subtotal,
        lotId: purchasesDetail.lotId,
      })
      .from(purchasesDetail)
      .innerJoin(products, eq(purchasesDetail.productId, products.id))
      .where(eq(purchasesDetail.purchaseId, id));

    return { ...purchase, details };
  }

  // Obtener compra por ID con detalles (para API externa, con nombres de usuarios)
  async getPurchaseById(id: number) {
    const results = await this.getPurchasesWithUserNames(eq(purchases.id, id));
    
    const purchase = results[0];

    if (!purchase) {
      throw new NotFoundError("Factura de compra no encontrada");
    }

    const details = await db
      .select({
        id: purchasesDetail.id,
        productId: purchasesDetail.productId,
        productName: products.name,
        quantity: purchasesDetail.quantity,
        unitCost: purchasesDetail.unitCost,
        originalCurrencyId: purchasesDetail.originalCurrencyId,
        exchangeRateUsed: purchasesDetail.exchangeRateUsed,
        convertedUnitCost: purchasesDetail.convertedUnitCost,
        subtotal: purchasesDetail.subtotal,
        lotId: purchasesDetail.lotId,
      })
      .from(purchasesDetail)
      .innerJoin(products, eq(purchasesDetail.productId, products.id))
      .where(eq(purchasesDetail.purchaseId, id));

    return Object.assign({}, purchase, { details });
  }

  // Aceptar factura de compra (genera lotes y movimientos)
  async acceptPurchase(id: number, userId: number) {
    const purchase = await this.getPurchaseByIdInternal(id);

    if (purchase.status !== "PENDING") {
      throw new ValidationError("Solo se pueden aceptar facturas en estado PENDING");
    }

    // Actualizar estado de factura
    await db
      .update(purchases)
      .set({
        status: "APPROVED",
        acceptedBy: userId,
        acceptedAt: new Date(),
      })
      .where(eq(purchases.id, id));

    // Crear lotes y movimientos por cada línea de detalle
    let lineNumber = 1;
    for (const detail of purchase.details) {
      const quantity = parseFloat(detail.quantity);
      const originalUnitCost = parseFloat(detail.unitCost);
      const exchangeRate = parseFloat(detail.exchangeRateUsed || "1");

      // Crear lote de inventario
      const lotId = await lotService.createLot({
        productId: detail.productId,
        warehouseId: purchase.warehouseId,
        quantity,
        originalCurrencyId: detail.originalCurrencyId || purchase.currencyId,
        originalUnitCost,
        exchangeRate,
        sourceType: "PURCHASE",
        sourceId: id,
        entryDate: normalizeBusinessDate(purchase.date),
      }, lineNumber);

      // Actualizar el detalle con la referencia al lote
      await db
        .update(purchasesDetail)
        .set({ lotId })
        .where(eq(purchasesDetail.id, detail.id));

      // Crear movimiento de inventario (para auditoría general)
      await db.insert(inventoryMovements).values({
        type: "INVOICE_ENTRY",
        status: "APPROVED",
        warehouseId: purchase.warehouseId,
        productId: detail.productId,
        quantity: detail.quantity,
        reference: purchase.invoiceNumber,
        reason: `Entrada por factura ${purchase.invoiceNumber}`,
        lotId,
      });

      lineNumber++;
    }

    return { message: "Factura de compra aceptada exitosamente. Lotes creados." };
  }

  // Cancelar factura de compra
  async cancelPurchase(id: number, cancellationReason: string, userId: number) {
    const purchase = await this.getPurchaseByIdInternal(id);

    if (purchase.status === "CANCELLED") {
      throw new ConflictError("La factura ya está cancelada");
    }

    // Si estaba aprobada, verificar que los lotes no hayan sido consumidos
    if (purchase.status === "APPROVED") {
      // Obtener lotes de esta compra
      const purchaseLots = await lotService.getLotsByPurchase(id);

      for (const lot of purchaseLots) {
        // Verificar si el lote tiene consumos
        const hasConsumptions = await lotService.hasConsumptions(lot.id);
        if (hasConsumptions) {
          throw new ConflictError(
            `No se puede cancelar la compra porque el lote ${lot.lotCode} ya tiene consumos registrados. ` +
            `Solo se pueden cancelar compras cuyos lotes no hayan sido vendidos, trasladados o ajustados.`
          );
        }

        // Verificar si la cantidad actual es menor a la inicial (consumo parcial sin registro)
        if (parseFloat(lot.currentQuantity) < parseFloat(lot.initialQuantity)) {
          throw new ConflictError(
            `No se puede cancelar la compra porque el lote ${lot.lotCode} tiene consumos parciales.`
          );
        }
      }

      // Si llegamos aquí, podemos cancelar: eliminar lotes y revertir inventario
      for (const lot of purchaseLots) {
        // Marcar lote como agotado (o podríamos eliminarlo)
        await db
          .update(inventoryLots)
          .set({ 
            status: "EXHAUSTED",
            currentQuantity: "0",
          })
          .where(eq(inventoryLots.id, lot.id));

        // Crear movimiento de reversión
        await db.insert(inventoryMovements).values({
          type: "ADJUSTMENT_EXIT",
          status: "APPROVED",
          warehouseId: lot.warehouseId,
          productId: lot.productId,
          quantity: lot.initialQuantity,
          reference: purchase.invoiceNumber,
          reason: `Reversión por cancelación de factura ${purchase.invoiceNumber}: ${cancellationReason}`,
          lotId: lot.id,
        });
      }
    }

    // Actualizar estado
    await db
      .update(purchases)
      .set({
        status: "CANCELLED",
        cancellationReason,
        cancelledBy: userId,
        cancelledAt: new Date(),
      })
      .where(eq(purchases.id, id));

    return { message: "Factura cancelada exitosamente" };
  }

  // Reporte de facturas canceladas
  async getCancelledPurchasesReport(startDate?: string, endDate?: string) {
    const conditions = [eq(purchases.status, "CANCELLED")];

    if (startDate) {
      conditions.push(gte(purchases.cancelledAt, sql`${startDate}`));
    }

    if (endDate) {
      conditions.push(lte(purchases.cancelledAt, sql`${endDate}`));
    }

    return await db
      .select()
      .from(purchases)
      .where(and(...conditions))
      .orderBy(desc(purchases.cancelledAt));
  }
}
