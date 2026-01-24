import { db } from "../../db/connection";
import { purchases } from "../../db/schema/purchases";
import { purchasesDetail } from "../../db/schema/purchases_detail";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { products } from "../../db/schema/products";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { normalizeBusinessDate } from "../../utils/date";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";
import { lotService } from "../inventory/lots.service";

// ID de la moneda base (CUP)
const BASE_CURRENCY_ID = 1;

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
  private async getExchangeRateToCUP(fromCurrencyId: number, date: string): Promise<number> {
    if (fromCurrencyId === BASE_CURRENCY_ID) {
      return 1; // Ya está en CUP
    }

    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrencyId, fromCurrencyId),
          eq(exchangeRates.toCurrencyId, BASE_CURRENCY_ID),
          sql`${exchangeRates.date} = ${date}`
        )
      );

    if (!rate) {
      throw new NotFoundError(
        `No existe tasa de cambio para la fecha ${date} de la moneda ID ${fromCurrencyId} a CUP. Debe crearla antes de continuar.`
      );
    }

    return parseFloat(rate.rate);
  }

  // Crear factura de compra
  async createPurchase(data: {
    supplierName?: string;
    supplierPhone?: string;
    date: string;
    warehouseId: number;
    currencyId: number;
    notes?: string;
    details: Array<{
      productId: number;
      quantity: number;
      unitCost: number;
    }>;
    userId: number;
  }) {
    // Generar número de factura
    const invoiceNumber = await this.generateInvoiceNumber();
    const normalizedDate = normalizeBusinessDate(data.date);

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

    // Crear factura
    const [purchase] = (await db.insert(purchases).values({
      invoiceNumber,
      supplierName: data.supplierName || null,
      supplierPhone: data.supplierPhone || null,
      date: new Date(normalizedDate),
      warehouseId: data.warehouseId,
      currencyId: data.currencyId,
      status: "PENDING",
      subtotal: subtotal.toString(),
      total: subtotal.toString(),
      notes: data.notes || null,
      createdBy: data.userId,
    })) as any;

    const purchaseId = purchase.insertId;

    // Insertar detalles
    await db.insert(purchasesDetail).values(
      detailsProcessed.map((detail) => ({
        purchaseId,
        ...detail,
      }))
    );

    return { id: purchaseId, invoiceNumber, subtotal, total: subtotal };
  }

  // Obtener todas las compras
  async getAllPurchases() {
    return await db.select().from(purchases).orderBy(desc(purchases.createdAt));
  }

  // Obtener compra por ID con detalles
  async getPurchaseById(id: number) {
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

  // Aceptar factura de compra (genera lotes y movimientos)
  async acceptPurchase(id: number, userId: number) {
    const purchase = await this.getPurchaseById(id);

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
        entryDate: purchase.date.toISOString().split("T")[0],
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
    const purchase = await this.getPurchaseById(id);

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
