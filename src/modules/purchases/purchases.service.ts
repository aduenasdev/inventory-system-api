import { db } from "../../db/connection";
import { purchases } from "../../db/schema/purchases";
import { purchasesDetail } from "../../db/schema/purchases_detail";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventory } from "../../db/schema/inventory";
import { products } from "../../db/schema/products";
import { exchangeRates } from "../../db/schema/exchange_rates";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { normalizeBusinessDate } from "../../utils/date";

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

  // Obtener tasa de cambio del día
  private async getExchangeRate(fromCurrencyId: number, toCurrencyId: number, date: string) {
    if (fromCurrencyId === toCurrencyId) {
      return null; // No necesita conversión
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
      throw new Error(
        `No existe tasa de cambio para la fecha ${date} entre las monedas especificadas. Debe crearla antes de continuar.`
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

    // Validar conversión de monedas para cada producto
    let subtotal = 0;

    const detailsWithConversion = await Promise.all(
      data.details.map(async (detail) => {
        // Obtener moneda del producto
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, detail.productId));

        if (!product) {
          throw new Error(`Producto con ID ${detail.productId} no encontrado`);
        }

        const productCurrencyId = product.currencyId;
        let convertedUnitCost = detail.unitCost;
        let exchangeRateUsed = null;

        // Si las monedas son diferentes, obtener tasa
        if (productCurrencyId !== data.currencyId) {
          exchangeRateUsed = await this.getExchangeRate(
            productCurrencyId,
            data.currencyId,
            data.date
          );
          convertedUnitCost = detail.unitCost * (exchangeRateUsed || 1);
        }

        const lineSubtotal = convertedUnitCost * detail.quantity;
        subtotal += lineSubtotal;

        return {
          productId: detail.productId,
          quantity: detail.quantity.toString(),
          unitCost: detail.unitCost.toString(),
          originalCurrencyId: productCurrencyId,
          exchangeRateUsed: exchangeRateUsed?.toString() || null,
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
      date: normalizeBusinessDate(data.date),
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
      detailsWithConversion.map((detail) => ({
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
      throw new Error("Factura de compra no encontrada");
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
      })
      .from(purchasesDetail)
      .innerJoin(products, eq(purchasesDetail.productId, products.id))
      .where(eq(purchasesDetail.purchaseId, id));

    return { ...purchase, details };
  }

  // Aceptar factura de compra (genera INVOICE_ENTRY y actualiza inventario)
  async acceptPurchase(id: number, userId: number) {
    const purchase = await this.getPurchaseById(id);

    if (purchase.status !== "PENDING") {
      throw new Error("Solo se pueden aceptar facturas en estado PENDING");
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

    // Crear movimientos APPROVED y actualizar inventario
    for (const detail of purchase.details) {
      // Crear movimiento INVOICE_ENTRY
      await db.insert(inventoryMovements).values({
        type: "INVOICE_ENTRY",
        status: "APPROVED",
        warehouseId: purchase.warehouseId,
        productId: detail.productId,
        quantity: detail.quantity,
        reference: purchase.invoiceNumber,
        reason: `Entrada por factura ${purchase.invoiceNumber}`,
      });

      // Actualizar inventario
      await this.updateInventory(
        purchase.warehouseId,
        detail.productId,
        parseFloat(detail.quantity)
      );
    }

    return { message: "Factura de compra aceptada exitosamente" };
  }

  // Cancelar factura de compra
  async cancelPurchase(id: number, cancellationReason: string, userId: number) {
    const purchase = await this.getPurchaseById(id);

    if (purchase.status === "CANCELLED") {
      throw new Error("La factura ya está cancelada");
    }

    const wasApproved = purchase.status === "APPROVED";

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

    // Si estaba aprobada, revertir inventario
    if (wasApproved) {
      for (const detail of purchase.details) {
        // Crear movimiento de reversión ADJUSTMENT_EXIT
        await db.insert(inventoryMovements).values({
          type: "ADJUSTMENT_EXIT",
          status: "APPROVED",
          warehouseId: purchase.warehouseId,
          productId: detail.productId,
          quantity: detail.quantity,
          reference: purchase.invoiceNumber,
          reason: `Reversión por cancelación de factura ${purchase.invoiceNumber}: ${cancellationReason}`,
        });

        // Restar del inventario
        await this.updateInventory(
          purchase.warehouseId,
          detail.productId,
          -parseFloat(detail.quantity)
        );
      }
    }

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

  // Método privado para actualizar inventario
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
