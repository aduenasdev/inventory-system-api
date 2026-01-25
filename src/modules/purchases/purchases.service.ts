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
import { userWarehouses } from "../../db/schema/user_warehouses";
import { categories } from "../../db/schema/categories";
import { units } from "../../db/schema/units";
import { eq, and, sql, desc, gte, lte, or, inArray, aliasedTable, like } from "drizzle-orm";
import { normalizeBusinessDate, getTodayDateString } from "../../utils/date";
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from "../../utils/errors";
import { lotService } from "../inventory/lots.service";

// ID de la moneda base (CUP)
const BASE_CURRENCY_ID = 1;

// Alias para usuarios (múltiples joins a la misma tabla)
const createdByUser = aliasedTable(users, "created_by_user");
const acceptedByUser = aliasedTable(users, "accepted_by_user");
const cancelledByUser = aliasedTable(users, "cancelled_by_user");

export class PurchasesService {
  // Generar número de factura auto-incremental con lock para evitar duplicados
  private async generateInvoiceNumber(tx?: any): Promise<string> {
    const database = tx || db;
    const year = new Date().getFullYear();
    
    // Usar FOR UPDATE para bloquear y evitar race conditions
    const [lastPurchase] = await database
      .select()
      .from(purchases)
      .where(sql`invoice_number LIKE ${`FC-${year}%`}`)
      .orderBy(desc(purchases.id))
      .limit(1)
      .for("update");

    let nextNumber = 1;
    if (lastPurchase) {
      const lastNumber = parseInt(lastPurchase.invoiceNumber.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    return `FC-${year}-${nextNumber.toString().padStart(5, "0")}`;
  }

  // Validar que el almacén existe
  private async validateWarehouseExists(warehouseId: number): Promise<void> {
    const [warehouse] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.id, warehouseId));
    
    if (!warehouse) {
      throw new NotFoundError(`Almacén con ID ${warehouseId} no encontrado`);
    }
  }

  // Validar que la moneda existe
  private async validateCurrencyExists(currencyId: number): Promise<void> {
    const [currency] = await db
      .select({ id: currencies.id })
      .from(currencies)
      .where(eq(currencies.id, currencyId));
    
    if (!currency) {
      throw new NotFoundError(`Moneda con ID ${currencyId} no encontrada`);
    }
  }

  // Validar que el usuario pertenece al almacén
  private async validateUserBelongsToWarehouse(userId: number, warehouseId: number): Promise<void> {
    const [userWarehouse] = await db
      .select()
      .from(userWarehouses)
      .where(
        and(
          eq(userWarehouses.userId, userId),
          eq(userWarehouses.warehouseId, warehouseId)
        )
      );
    
    if (!userWarehouse) {
      throw new ForbiddenError(`No tienes permiso para realizar compras en este almacén`);
    }
  }

  // Obtener tasa de cambio del día (de moneda origen a CUP)
  // Las tasas se guardan como CUP → X, donde rate significa "cuántos CUP vale 1 X"
  // Ejemplo: CUP → USD con rate=370 significa 1 USD = 370 CUP
  private async getExchangeRateToCUP(fromCurrencyId: number, date: string): Promise<number> {
    if (fromCurrencyId === BASE_CURRENCY_ID) {
      return 1; // Ya está en CUP
    }

    // Obtener nombre de la moneda para mensajes de error
    const [currency] = await db
      .select({ name: currencies.name, code: currencies.code })
      .from(currencies)
      .where(eq(currencies.id, fromCurrencyId));

    const currencyName = currency ? `${currency.name} (${currency.code})` : `ID ${fromCurrencyId}`;

    // Buscar tasa CUP → fromCurrency
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
        `No existe tasa de cambio para la fecha ${date} de ${currencyName} a CUP. Debe crearla antes de continuar.`
      );
    }

    // La tasa guardada es directa: rate = cuántos CUP vale 1 unidad de la moneda extranjera
    // Ejemplo: CUP → USD con rate=370 significa 1 USD = 370 CUP
    // Para convertir de USD a CUP: valor_usd * 370 = valor_cup
    const rateValue = parseFloat(rate.rate);
    if (rateValue === 0) {
      throw new ValidationError("La tasa de cambio no puede ser cero");
    }
    
    return rateValue; // Usar directo, NO invertir
  }

  // Crear factura de compra (con transacción para garantizar consistencia)
  async createPurchase(data: {
    supplierName?: string;
    supplierPhone?: string;
    warehouseId: number;
    currencyId: number;
    date?: string; // Fecha de la compra (opcional, default: hoy)
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
    // Validaciones previas (fuera de transacción para fallar rápido)
    await this.validateWarehouseExists(data.warehouseId);
    await this.validateCurrencyExists(data.currencyId);
    await this.validateUserBelongsToWarehouse(data.userId, data.warehouseId);

    // Verificar si puede auto-aprobar
    const canAutoApprove = data.autoApprove && data.userPermissions.includes("purchases.accept");
    
    // Fecha de la compra: usar la proporcionada o la fecha actual
    const today = getTodayDateString();
    const purchaseDate = data.date ? normalizeBusinessDate(data.date) : today;
    
    // Validar que la fecha no sea futura
    if (purchaseDate > today) {
      throw new ValidationError("No se pueden registrar compras con fecha futura");
    }

    // Obtener tasa de cambio de la moneda de la factura a CUP (usando la fecha de la compra)
    // Si no existe tasa para esa fecha, lanzará error
    const exchangeRateToCUP = await this.getExchangeRateToCUP(data.currencyId, purchaseDate);

    // Validar que hay al menos un detalle
    if (!data.details || data.details.length === 0) {
      throw new ValidationError("La factura debe tener al menos un producto");
    }

    // Validar productos y preparar detalles (fuera de transacción)
    let subtotal = 0;
    const detailsProcessed = await Promise.all(
      data.details.map(async (detail, index) => {
        // Validar cantidad mayor a 0
        if (detail.quantity <= 0) {
          throw new ValidationError(`La cantidad del producto en línea ${index + 1} debe ser mayor a 0`);
        }

        // Validar costo mayor o igual a 0
        if (detail.unitCost < 0) {
          throw new ValidationError(`El costo unitario del producto en línea ${index + 1} no puede ser negativo`);
        }

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
          lineIndex: index, // Para identificar cada línea únicamente
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

    // Ejecutar todo en transacción
    return await db.transaction(async (tx) => {
      // Generar número de factura dentro de transacción (con lock)
      const invoiceNumber = await this.generateInvoiceNumber(tx);

      // Crear factura (PENDING o APPROVED según autoApprove)
      const [purchase] = (await tx.insert(purchases).values({
        invoiceNumber,
        supplierName: data.supplierName || null,
        supplierPhone: data.supplierPhone || null,
        date: sql`${purchaseDate}`,
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

      // Insertar detalles y obtener sus IDs
      const insertedDetailIds: number[] = [];
      for (const detail of detailsProcessed) {
        const { lineIndex, ...detailData } = detail;
        const [insertResult] = (await tx.insert(purchasesDetail).values({
          purchaseId,
          ...detailData,
        })) as any;
        insertedDetailIds.push(insertResult.insertId);
      }

      // Si es auto-aprobada, crear lotes y movimientos inmediatamente
      if (canAutoApprove) {
        for (let i = 0; i < detailsProcessed.length; i++) {
          const detail = detailsProcessed[i];
          const detailId = insertedDetailIds[i];
          const lineNumber = i + 1;

          const quantity = parseFloat(detail.quantity);
          const originalUnitCost = parseFloat(detail.unitCost);
          const exchangeRate = parseFloat(detail.exchangeRateUsed);
          const unitCostBase = parseFloat(detail.convertedUnitCost); // Usar el ya calculado

          // Crear lote de inventario (pasando tx para atomicidad)
          // NOTA: entryDate usa la fecha de HOY (entrada real al almacén), no la fecha de compra
          // La fecha de compra solo afecta la tasa de cambio, no el orden FIFO
          const lotId = await lotService.createLot({
            productId: detail.productId,
            warehouseId: data.warehouseId,
            quantity,
            originalCurrencyId: detail.originalCurrencyId,
            originalUnitCost,
            exchangeRate,
            unitCostBase, // Pasar costo ya convertido para evitar recálculo
            sourceType: "PURCHASE",
            sourceId: purchaseId,
            entryDate: today, // Fecha real de entrada (HOY), no fecha contable de compra
          }, lineNumber, tx);

          // Actualizar el detalle con la referencia al lote (usando ID directo)
          await tx
            .update(purchasesDetail)
            .set({ lotId })
            .where(eq(purchasesDetail.id, detailId));

          // Crear movimiento de inventario
          await tx.insert(inventoryMovements).values({
            type: "INVOICE_ENTRY",
            status: "APPROVED",
            warehouseId: data.warehouseId,
            productId: detail.productId,
            quantity: detail.quantity,
            reference: invoiceNumber,
            reason: `Entrada por factura ${invoiceNumber}`,
            lotId,
          });
        }
      }

      return { 
        id: purchaseId, 
        invoiceNumber, 
        subtotal, 
        total: subtotal,
        status: canAutoApprove ? "APPROVED" : "PENDING"
      };
    });
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
  // RESTRICCIÓN: Solo ve compras de almacenes asignados al usuario
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

    // Obtener almacenes asignados al usuario
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    const assignedWarehouseIds = userWarehousesData.map(uw => uw.warehouseId);

    // Si el usuario no tiene almacenes asignados, no puede ver nada
    if (assignedWarehouseIds.length === 0) {
      return [];
    }

    // Condiciones base
    const baseConditions: any[] = [
      gte(purchases.date, sql`${startDate}`),
      lte(purchases.date, sql`${endDate}`),
      // RESTRICCIÓN: Solo almacenes asignados al usuario
      inArray(purchases.warehouseId, assignedWarehouseIds)
    ];

    // Filtro opcional por almacén (debe estar en sus almacenes asignados)
    if (warehouseId) {
      if (!assignedWarehouseIds.includes(warehouseId)) {
        // Silenciosamente retorna vacío si pide un almacén que no le pertenece
        return [];
      }
      baseConditions.push(eq(purchases.warehouseId, warehouseId));
    }

    // Filtro opcional por estado (solo si tiene permiso para ver ese estado)
    if (status) {
      baseConditions.push(eq(purchases.status, status));
    }

    const baseCondition = and(...baseConditions);

    // Si tiene purchases.read → ve TODAS de sus almacenes (dentro del rango y filtros)
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

    // Combinar: (permisos OR) AND (condiciones base incluyendo restricción de almacenes)
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
  // RESTRICCIÓN: Solo puede ver compras de sus almacenes asignados
  async getPurchaseById(id: number, userId: number) {
    // Primero obtener la compra básica para validar el almacén
    const purchaseBasic = await this.getPurchaseByIdInternal(id);
    
    // Validar que el usuario pertenece al almacén de la compra
    await this.validateUserBelongsToWarehouse(userId, purchaseBasic.warehouseId);

    // Ahora obtener con todos los datos de usuarios
    const results = await this.getPurchasesWithUserNames(eq(purchases.id, id));
    const purchase = results[0]!;

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

  // Aceptar factura de compra (genera lotes y movimientos) - con transacción
  // RESTRICCIÓN: Solo puede aceptar compras de sus almacenes asignados
  async acceptPurchase(id: number, userId: number) {
    const purchase = await this.getPurchaseByIdInternal(id);

    // Validar que el usuario pertenece al almacén de la compra
    await this.validateUserBelongsToWarehouse(userId, purchase.warehouseId);

    if (purchase.status !== "PENDING") {
      throw new ValidationError("Solo se pueden aceptar facturas en estado PENDING");
    }

    return await db.transaction(async (tx) => {
      // Actualizar estado de factura
      await tx
        .update(purchases)
        .set({
          status: "APPROVED",
          acceptedBy: userId,
          acceptedAt: new Date(),
        })
        .where(eq(purchases.id, id));

      // Crear lotes y movimientos por cada línea de detalle
      // NOTA: La fecha del lote es HOY (fecha de aprobación/entrada real), no la fecha de compra
      // Esto mantiene el FIFO correcto. La tasa de cambio ya está fijada en el detalle.
      const todayForLot = getTodayDateString();
      
      for (let i = 0; i < purchase.details.length; i++) {
        const detail = purchase.details[i];
        const lineNumber = i + 1;
        
        const quantity = parseFloat(detail.quantity);
        const originalUnitCost = parseFloat(detail.unitCost);
        const exchangeRate = parseFloat(detail.exchangeRateUsed || "1");
        const unitCostBase = detail.convertedUnitCost 
          ? parseFloat(detail.convertedUnitCost) 
          : originalUnitCost * exchangeRate; // Usar el ya calculado o calcular

        // Crear lote de inventario (pasando tx para atomicidad)
        const lotId = await lotService.createLot({
          productId: detail.productId,
          warehouseId: purchase.warehouseId,
          quantity,
          originalCurrencyId: detail.originalCurrencyId || purchase.currencyId,
          originalUnitCost,
          exchangeRate,
          unitCostBase, // Pasar costo ya convertido para evitar recálculo
          sourceType: "PURCHASE",
          sourceId: id,
          entryDate: todayForLot, // Fecha de aprobación (entrada real), no fecha de compra
        }, lineNumber, tx);

        // Actualizar el detalle con la referencia al lote (usando ID directo)
        await tx
          .update(purchasesDetail)
          .set({ lotId })
          .where(eq(purchasesDetail.id, detail.id));

        // Crear movimiento de inventario (para auditoría general)
        await tx.insert(inventoryMovements).values({
          type: "INVOICE_ENTRY",
          status: "APPROVED",
          warehouseId: purchase.warehouseId,
          productId: detail.productId,
          quantity: detail.quantity,
          reference: purchase.invoiceNumber,
          reason: `Entrada por factura ${purchase.invoiceNumber}`,
          lotId,
        });
      }

      return { message: "Factura de compra aceptada exitosamente. Lotes creados." };
    });
  }

  // Cancelar factura de compra (con transacción)
  // RESTRICCIÓN: Solo puede cancelar compras de sus almacenes asignados
  async cancelPurchase(id: number, cancellationReason: string, userId: number) {
    const purchase = await this.getPurchaseByIdInternal(id);

    // Validar que el usuario pertenece al almacén de la compra
    await this.validateUserBelongsToWarehouse(userId, purchase.warehouseId);

    if (purchase.status === "CANCELLED") {
      throw new ConflictError("La factura ya está cancelada");
    }

    // Si estaba aprobada, verificar que los lotes no hayan sido consumidos (fuera de tx para fallar rápido)
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

      // Ejecutar cancelación en transacción
      return await db.transaction(async (tx) => {
        // Revertir lotes y crear movimientos
        for (const lot of purchaseLots) {
          const lotQuantity = parseFloat(lot.initialQuantity);
          
          // Marcar lote como agotado
          await tx
            .update(inventoryLots)
            .set({ 
              status: "EXHAUSTED",
              currentQuantity: "0",
            })
            .where(eq(inventoryLots.id, lot.id));

          // Actualizar caché de inventario (restar la cantidad del lote)
          await lotService.updateInventoryCache(
            lot.warehouseId, 
            lot.productId, 
            -lotQuantity, 
            tx
          );

          // Crear movimiento de reversión
          await tx.insert(inventoryMovements).values({
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

        // Actualizar estado de compra
        await tx
          .update(purchases)
          .set({
            status: "CANCELLED",
            cancellationReason,
            cancelledBy: userId,
            cancelledAt: new Date(),
          })
          .where(eq(purchases.id, id));

        return { message: "Factura cancelada exitosamente" };
      });
    }

    // Si estaba en PENDING, solo actualizar estado (sin transacción necesaria)
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
  // RESTRICCIÓN: Solo ve facturas canceladas de sus almacenes asignados
  async getCancelledPurchasesReport(userId: number, startDate?: string, endDate?: string) {
    // Obtener almacenes asignados al usuario
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    const assignedWarehouseIds = userWarehousesData.map(uw => uw.warehouseId);

    // Si el usuario no tiene almacenes asignados, no puede ver nada
    if (assignedWarehouseIds.length === 0) {
      return [];
    }

    const conditions = [
      eq(purchases.status, "CANCELLED"),
      inArray(purchases.warehouseId, assignedWarehouseIds)
    ];

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

  // ========== ENDPOINTS AUXILIARES PARA FRONTEND ==========

  // Obtener almacenes disponibles del usuario (para selector de compra)
  // Solo devuelve almacenes activos asignados al usuario
  async getUserWarehouses(userId: number) {
    const userWarehousesData = await db
      .select({
        warehouseId: userWarehouses.warehouseId,
        warehouseName: warehouses.name,
        warehouseDireccion: warehouses.direccion,
      })
      .from(userWarehouses)
      .innerJoin(warehouses, eq(userWarehouses.warehouseId, warehouses.id))
      .where(
        and(
          eq(userWarehouses.userId, userId),
          eq(warehouses.active, true)
        )
      );

    return userWarehousesData;
  }

  // Obtener productos disponibles para comprar (con filtros)
  async getProducts(search?: string, categoryId?: number) {
    const conditions: any[] = [];

    if (search) {
      conditions.push(
        or(
          like(products.name, `%${search}%`),
          like(products.code, `%${search}%`)
        )
      );
    }

    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    const productList = await db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        description: products.description,
        categoryId: products.categoryId,
        categoryName: categories.name,
        unitId: products.unitId,
        unitName: units.name,
        unitShortName: units.shortName,
        currencyId: products.currencyId,
        currencySymbol: currencies.symbol,
        currencyCode: currencies.code,
        costPrice: products.costPrice,
        salePrice: products.salePrice,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(units, eq(products.unitId, units.id))
      .leftJoin(currencies, eq(products.currencyId, currencies.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(products.name);

    return productList;
  }

  // Obtener todas las monedas activas
  async getCurrencies() {
    return await db
      .select({
        id: currencies.id,
        code: currencies.code,
        symbol: currencies.symbol,
        name: currencies.name,
      })
      .from(currencies)
      .where(eq(currencies.isActive, true))
      .orderBy(currencies.id);
  }

  // Verificar tasas de cambio disponibles para una fecha específica
  // Si se pasa date, requiere permiso purchases.backdate
  async checkExchangeRates(
    invoiceCurrencyId: number,
    date?: string,
    userPermissions: string[] = []
  ) {
    const today = getTodayDateString();
    let targetDate = today;

    // Si se pasa una fecha específica, validar permisos
    if (date) {
      // Validar que no sea fecha futura
      if (date > today) {
        throw new Error("No se puede consultar tasas de cambio para fechas futuras");
      }

      // Si es una fecha diferente a hoy, requiere permiso
      if (date !== today) {
        if (!userPermissions.includes("purchases.backdate")) {
          throw new Error(
            "No tienes permiso para consultar tasas de cambio de fechas anteriores. " +
            "Requiere permiso: purchases.backdate"
          );
        }
        targetDate = date;
      }
    }
    
    // Obtener todas las monedas
    const allCurrencies = await db
      .select({
        id: currencies.id,
        symbol: currencies.symbol,
        name: currencies.name,
        code: currencies.code,
      })
      .from(currencies);

    // Obtener las tasas de cambio del día objetivo (CUP → X)
    const dateRates = await db
      .select({
        toCurrencyId: exchangeRates.toCurrencyId,
        rate: exchangeRates.rate,
      })
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrencyId, BASE_CURRENCY_ID),
          sql`DATE(${exchangeRates.date}) = ${targetDate}`
        )
      );

    const ratesMap = new Map(dateRates.map((r) => [r.toCurrencyId, r.rate]));

    // Para cada moneda, verificar si tiene tasa de cambio
    const currencyStatus = allCurrencies.map((currency) => {
      const hasRate = currency.id === BASE_CURRENCY_ID || ratesMap.has(currency.id);
      return {
        id: currency.id,
        code: currency.code,
        symbol: currency.symbol,
        name: currency.name,
        hasExchangeRate: hasRate,
        rate: currency.id === BASE_CURRENCY_ID ? "1" : ratesMap.get(currency.id) || null,
      };
    });

    // Verificar si la moneda seleccionada para la factura tiene tasa
    const selectedCurrency = currencyStatus.find((c) => c.id === invoiceCurrencyId);
    const canCreatePurchase = selectedCurrency?.hasExchangeRate ?? false;

    // Monedas sin tasa de cambio
    const missingRates = currencyStatus.filter((c) => !c.hasExchangeRate);

    const isBackdate = targetDate !== today;

    return {
      date: targetDate,
      isBackdate,
      invoiceCurrency: selectedCurrency,
      canCreatePurchase,
      allCurrencies: currencyStatus,
      missingRates,
      message: canCreatePurchase
        ? isBackdate 
          ? `Puede crear compras retroactivas con esta moneda para el ${targetDate}`
          : "Puede crear compras con esta moneda"
        : `No hay tasa de cambio para ${selectedCurrency?.symbol || "la moneda seleccionada"} el día ${targetDate}`,
    };
  }

  // Obtener categorías activas (para filtro de productos)
  async getCategories() {
    return await db
      .select({
        id: categories.id,
        name: categories.name,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.name);
  }

  // Obtener unidades de medida activas
  async getUnits() {
    return await db
      .select({
        id: units.id,
        name: units.name,
        shortName: units.shortName,
        type: units.type,
      })
      .from(units)
      .where(eq(units.isActive, true))
      .orderBy(units.name);
  }
}
