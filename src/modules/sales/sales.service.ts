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
import { units } from "../../db/schema/units";
import { categories } from "../../db/schema/categories";
import { eq, and, sql, desc, gte, lte, inArray, or, aliasedTable, like, gt } from "drizzle-orm";
import { normalizeBusinessDate, getTodayDateString } from "../../utils/date";
import { NotFoundError, ValidationError, ConflictError, ForbiddenError } from "../../utils/errors";
import { lotService } from "../inventory/lots.service";

const BASE_CURRENCY_ID = 1;

// Alias para usuarios (múltiples joins a la misma tabla)
const createdByUser = aliasedTable(users, "created_by_user");
const acceptedByUser = aliasedTable(users, "accepted_by_user");
const cancelledByUser = aliasedTable(users, "cancelled_by_user");
const paidByUser = aliasedTable(users, "paid_by_user");

export class SalesService {
  // Generar número de factura con lock para evitar duplicados
  private async generateInvoiceNumber(tx?: any): Promise<string> {
    const database = tx || db;
    const year = new Date().getFullYear();
    const [lastSale] = await database
      .select()
      .from(sales)
      .where(sql`invoice_number LIKE ${`FV-${year}%`}`)
      .orderBy(desc(sales.id))
      .limit(1)
      .for("update");

    let nextNumber = 1;
    if (lastSale) {
      const lastNumber = parseInt(lastSale.invoiceNumber.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    return `FV-${year}-${nextNumber.toString().padStart(5, "0")}`;
  }

  // Validar que el establecimiento existe
  private async validateWarehouseExists(warehouseId: number): Promise<void> {
    const [warehouse] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.id, warehouseId));
    
    if (!warehouse) {
      throw new NotFoundError(`Establecimiento con ID ${warehouseId} no encontrado`);
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

  // Obtener nombre de moneda para mensajes de error
  private async getCurrencyName(currencyId: number): Promise<string> {
    const [currency] = await db
      .select({ name: currencies.name, code: currencies.code })
      .from(currencies)
      .where(eq(currencies.id, currencyId));
    
    return currency ? `${currency.name} (${currency.code})` : `ID ${currencyId}`;
  }

  // Obtener tasa de cambio
  // Las tasas se guardan como CUP (1) → X, donde rate significa "cuántos CUP vale 1 X"
  // Ejemplo: CUP → USD con rate=370 significa 1 USD = 370 CUP
  private async getExchangeRate(fromCurrencyId: number, toCurrencyId: number, date: string): Promise<number | null> {
    if (fromCurrencyId === toCurrencyId) {
      return null;
    }

    // Caso 1: Buscamos X → CUP 
    // La tasa guardada es CUP → X = rate (cuántos CUP vale 1 X)
    // Para convertir X → CUP: valor_x * rate = valor_cup
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
        const currencyName = await this.getCurrencyName(fromCurrencyId);
        throw new NotFoundError(
          `No existe tasa de cambio para la fecha ${date} de ${currencyName} a CUP. Debe crearla antes de continuar.`
        );
      }

      const rateValue = parseFloat(rate.rate);
      // Usar directo: para convertir USD a CUP, multiplicar por la tasa (370)
      return rateValue !== 0 ? rateValue : null;
    }

    // Caso 2: Buscamos CUP → X
    // La tasa guardada es CUP → X = rate (cuántos CUP vale 1 X)
    // Para convertir CUP → X: valor_cup / rate = valor_x
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
        const currencyName = await this.getCurrencyName(toCurrencyId);
        throw new NotFoundError(
          `No existe tasa de cambio para la fecha ${date} de CUP a ${currencyName}. Debe crearla antes de continuar.`
        );
      }

      const rateValue = parseFloat(rate.rate);
      // Para convertir CUP a USD: dividir por la tasa (370)
      return rateValue !== 0 ? 1 / rateValue : null;
    }

    // Caso 3: X → Y (ambas diferentes de CUP) - convertir via CUP
    // Primero X → CUP (multiplicar por rate de X)
    // Luego CUP → Y (dividir por rate de Y)
    const rateXtoCUP: number | null = await this.getExchangeRate(fromCurrencyId, BASE_CURRENCY_ID, date);
    const rateCUPtoY: number | null = await this.getExchangeRate(BASE_CURRENCY_ID, toCurrencyId, date);
    
    if (rateXtoCUP && rateCUPtoY) {
      return rateXtoCUP * rateCUPtoY;
    }

    throw new NotFoundError(
      `No existe tasa de cambio para la fecha ${date} entre las monedas especificadas. Debe crearla antes de continuar.`
    );
  }

  // Validar que existe tasa de cambio (sin retornar valor, solo verificar)
  private async validateExchangeRateExists(fromCurrencyId: number, toCurrencyId: number, date: string, productName?: string) {
    if (fromCurrencyId === toCurrencyId) {
      return; // No necesita conversión
    }

    // Obtener nombres de monedas para mensaje más claro
    const [fromCurrency] = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.id, fromCurrencyId));
    const [toCurrency] = await db.select({ code: currencies.code }).from(currencies).where(eq(currencies.id, toCurrencyId));
    
    const fromCode = fromCurrency?.code || `ID:${fromCurrencyId}`;
    const toCode = toCurrency?.code || `ID:${toCurrencyId}`;

    try {
      await this.getExchangeRate(fromCurrencyId, toCurrencyId, date);
    } catch {
      const productInfo = productName ? ` para el producto "${productName}"` : '';
      throw new ValidationError(
        `No existe tasa de cambio de ${fromCode} a ${toCode} para la fecha de hoy (${date})${productInfo}. ` +
        `Debe crear la tasa de cambio antes de realizar la venta.`
      );
    }
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
        `Stock insuficiente para el producto "${product.name}". Disponible: ${availableStock.toFixed(2)}, Solicitado: ${quantity}`
      );
    }
  }

  // Validar que el usuario pertenece al establecimiento
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
      throw new ForbiddenError(`No tienes permiso para realizar ventas en este establecimiento`);
    }
  }

  // Crear factura de venta (con transacción para garantizar consistencia)
  async createSale(data: {
    customerName?: string;
    customerPhone?: string;
    warehouseId: number;
    currencyId: number;
    paymentTypeId: number; // Obligatorio
    date?: string; // Fecha de la venta (opcional, default: hoy)
    backdateReason?: string; // Requerido si date es retroactiva
    notes?: string;
    autoApprove?: boolean;
    details: Array<{
      productId: number;
      quantity: number;
      unitPrice: number;
    }>;
    userId: number;
    userPermissions: string[];
  }) {
    // Validaciones previas (fuera de transacción para fallar rápido)
    await this.validateWarehouseExists(data.warehouseId);
    await this.validateCurrencyExists(data.currencyId);
    await this.validateUserBelongsToWarehouse(data.userId, data.warehouseId);

    // Verificar si puede auto-aprobar
    const canAutoApprove = data.autoApprove && data.userPermissions.includes("sales.accept");
    
    // Fecha de la venta: usar la proporcionada o la fecha actual
    const today = getTodayDateString();
    const saleDate = data.date ? normalizeBusinessDate(data.date) : today;
    const isBackdated = saleDate < today;
    
    // Validar fecha retroactiva
    if (isBackdated) {
      // Verificar permiso especial para fechas retroactivas
      if (!data.userPermissions.includes("sales.backdate")) {
        throw new ForbiddenError(
          "No tiene permiso para crear ventas con fecha retroactiva. Requiere el permiso 'sales.backdate'."
        );
      }
      
      // Exigir motivo obligatorio
      if (!data.backdateReason || data.backdateReason.trim().length < 10) {
        throw new ValidationError(
          "Debe proporcionar un motivo para la fecha retroactiva (mínimo 10 caracteres) en el campo 'backdateReason'."
        );
      }
    }
    
    // Validar que la fecha no sea futura
    if (saleDate > today) {
      throw new ValidationError("No se pueden registrar ventas con fecha futura");
    }

    // Validar que hay al menos un detalle
    if (!data.details || data.details.length === 0) {
      throw new ValidationError("La factura debe tener al menos un producto");
    }

    // Validar cantidades y precios
    for (let i = 0; i < data.details.length; i++) {
      const detail = data.details[i];
      if (detail.quantity <= 0) {
        throw new ValidationError(`La cantidad del producto en línea ${i + 1} debe ser mayor a 0`);
      }
      if (detail.unitPrice < 0) {
        throw new ValidationError(`El precio unitario del producto en línea ${i + 1} no puede ser negativo`);
      }
    }
    
    // Validar paymentTypeId de la factura (obligatorio)
    const [paymentType] = await db
      .select()
      .from(paymentTypes)
      .where(eq(paymentTypes.id, data.paymentTypeId));

    if (!paymentType) {
      throw new NotFoundError(`Tipo de pago con ID ${data.paymentTypeId} no encontrado`);
    }

    // Validar stock para todos los productos
    for (const detail of data.details) {
      await this.checkStock(data.warehouseId, detail.productId, detail.quantity);
    }

    // Validar tasa de cambio si la factura NO está en CUP (usando la fecha de la venta)
    if (data.currencyId !== BASE_CURRENCY_ID) {
      await this.validateExchangeRateExists(data.currencyId, BASE_CURRENCY_ID, saleDate);
    }

    // Preparar notas con motivo de fecha retroactiva si aplica
    let finalNotes = data.notes || "";
    if (isBackdated) {
      const backdateNote = `[FECHA RETROACTIVA: ${data.backdateReason}]`;
      finalNotes = finalNotes ? `${backdateNote} ${finalNotes}` : backdateNote;
    }

    // Procesar detalles (fuera de transacción)
    let subtotal = 0;

    const detailsWithConversion = await Promise.all(
      data.details.map(async (detail, index) => {
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, detail.productId));

        if (!product) {
          throw new NotFoundError(`Producto con ID ${detail.productId} no encontrado`);
        }

        // El precio de venta viene en la moneda de la factura (no del producto)
        // Solo calculamos el precio convertido a CUP para referencia/reportes si la factura no es en CUP
        const facturaCurrencyId = data.currencyId;
        let convertedUnitPrice = detail.unitPrice;
        let exchangeRateUsed = null;

        // Si la factura NO está en CUP, guardamos la tasa para poder convertir a CUP después (reportes)
        // IMPORTANTE: Usamos la tasa de la fecha de la venta, no de hoy
        if (facturaCurrencyId !== BASE_CURRENCY_ID) {
          // Obtener tasa de la moneda de factura a CUP
          // Ejemplo: Factura en USD, tasa USD→CUP = 370
          // convertedUnitPrice = precio en USD * 370 = precio equivalente en CUP
          const rateToCUP = await this.getExchangeRate(
            facturaCurrencyId,
            BASE_CURRENCY_ID,
            saleDate // Usar fecha de la venta para obtener la tasa correcta
          );
          exchangeRateUsed = rateToCUP;
          convertedUnitPrice = detail.unitPrice * (rateToCUP || 1);
        }

        // El subtotal siempre está en la moneda de la factura
        const lineSubtotal = detail.unitPrice * detail.quantity;
        subtotal += lineSubtotal;

        return {
          lineIndex: index, // Para identificar cada línea únicamente
          productId: detail.productId,
          quantity: detail.quantity.toString(),
          unitPrice: detail.unitPrice.toString(),
          originalCurrencyId: facturaCurrencyId, // La moneda original es la de la factura
          exchangeRateUsed: exchangeRateUsed?.toString() || null,
          convertedUnitPrice: convertedUnitPrice.toString(), // Precio convertido a CUP (si aplica)
          subtotal: lineSubtotal.toString(),
        };
      })
    );

    // Ejecutar todo en transacción
    return await db.transaction(async (tx) => {
      // Generar número de factura dentro de transacción (con lock)
      const invoiceNumber = await this.generateInvoiceNumber(tx);

      // Crear factura (PENDING o APPROVED según autoApprove)
      const [sale] = (await tx.insert(sales).values({
        invoiceNumber,
        customerName: data.customerName || null,
        customerPhone: data.customerPhone || null,
        date: sql`${saleDate}`, // Usar fecha de venta (puede ser retroactiva)
        warehouseId: data.warehouseId,
        currencyId: data.currencyId,
        paymentTypeId: data.paymentTypeId || null,
        status: canAutoApprove ? "APPROVED" : "PENDING",
        subtotal: subtotal.toString(),
        total: subtotal.toString(),
        notes: finalNotes || null, // Incluye motivo de fecha retroactiva si aplica
        createdBy: data.userId,
        acceptedBy: canAutoApprove ? data.userId : null,
        acceptedAt: canAutoApprove ? new Date() : null,
      })) as any;

      const saleId = sale.insertId;

      // Insertar detalles y obtener sus IDs
      const insertedDetailIds: number[] = [];
      for (const detail of detailsWithConversion) {
        const { lineIndex, ...detailData } = detail;
        const [insertResult] = (await tx.insert(salesDetail).values({
          saleId,
          ...detailData,
        })) as any;
        insertedDetailIds.push(insertResult.insertId);
      }

      // Si es auto-aprobada, consumir lotes inmediatamente
      if (canAutoApprove) {
        for (let i = 0; i < detailsWithConversion.length; i++) {
          const detail = detailsWithConversion[i];
          const detailId = insertedDetailIds[i];
          
          const quantity = parseFloat(detail.quantity);
          const unitPrice = parseFloat(detail.convertedUnitPrice || detail.unitPrice);
          const revenue = unitPrice * quantity;

          // Consumir lotes FIFO (pasando tx para atomicidad)
          const consumeResult = await lotService.consumeLotsFromWarehouse(
            data.warehouseId,
            detail.productId,
            quantity,
            "SALE",
            "sales_detail",
            detailId,
            tx
          );

          const realCost = consumeResult.totalCost;
          const margin = revenue - realCost;

          // Actualizar detalle con costo real y margen (usando ID directo)
          await tx
            .update(salesDetail)
            .set({
              realCost: realCost.toString(),
              margin: margin.toString(),
            })
            .where(eq(salesDetail.id, detailId));

          // Crear movimiento de inventario
          await tx.insert(inventoryMovements).values({
            type: "SALE_EXIT",
            status: "APPROVED",
            warehouseId: data.warehouseId,
            productId: detail.productId,
            quantity: detail.quantity,
            reference: invoiceNumber,
            reason: `Salida por venta ${invoiceNumber}. Costo real: ${realCost.toFixed(2)}, Margen: ${margin.toFixed(2)}`,
          });
        }
      }

      return saleId;
    }).then(async (saleId) => {
      // Obtener la venta completa con todos los detalles para el frontend
      const completeSale = await this.getSaleById(saleId);
      return {
        message: canAutoApprove 
          ? "Venta creada y aprobada exitosamente" 
          : "Venta creada exitosamente (pendiente de aprobación)",
        data: completeSale
      };
    });
  }

  // Procesar venta aprobada (consumir lotes y calcular costos) - usado por acceptSale
  private async processApprovedSale(sale: any, tx?: any) {
    const database = tx || db;
    for (const detail of sale.details) {
      const quantity = parseFloat(detail.quantity);
      const unitPrice = parseFloat(detail.convertedUnitPrice || detail.unitPrice);
      const revenue = unitPrice * quantity;

      // Consumir lotes FIFO (pasando tx para atomicidad)
      const consumeResult = await lotService.consumeLotsFromWarehouse(
        sale.warehouseId,
        detail.productId,
        quantity,
        "SALE",
        "sales_detail",
        detail.id,
        database
      );

      const realCost = consumeResult.totalCost;
      const margin = revenue - realCost;

      // Actualizar detalle con costo real y margen
      await database
        .update(salesDetail)
        .set({
          realCost: realCost.toString(),
          margin: margin.toString(),
        })
        .where(eq(salesDetail.id, detail.id));

      // Crear movimiento de inventario (para auditoría general)
      await database.insert(inventoryMovements).values({
        type: "SALE_EXIT",
        status: "APPROVED",
        warehouseId: sale.warehouseId,
        productId: detail.productId,
        quantity: detail.quantity,
        reference: sale.invoiceNumber,
        reason: `Salida por venta ${sale.invoiceNumber}. Costo real: ${realCost.toFixed(2)}, Margen: ${margin.toFixed(2)}`,
      });
    }
  }

  // Query base con JOINs para obtener nombres de usuarios, establecimiento y moneda (para listados)
  private async getSalesWithUserNames(
    whereCondition: any,
    pagination?: { page: number; limit: number }
  ) {
    const query = db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        customerName: sales.customerName,
        customerPhone: sales.customerPhone,
        date: sql<string>`DATE_FORMAT(${sales.date}, '%Y-%m-%d')`.as('date'),
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        currencyId: sales.currencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        paymentTypeId: sales.paymentTypeId,
        paymentTypeName: paymentTypes.type,
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
      .leftJoin(paymentTypes, eq(sales.paymentTypeId, paymentTypes.id))
      .where(whereCondition)
      .orderBy(desc(sales.createdAt));

    if (pagination) {
      const offset = (pagination.page - 1) * pagination.limit;
      return await query.limit(pagination.limit).offset(offset);
    }

    return await query;
  }

  // Contar total de ventas para paginación
  private async countSales(whereCondition: any): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sales)
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .where(whereCondition);
    return Number(result?.count || 0);
  }

  // Obtener ventas filtradas según permisos del usuario y rango de fechas
  async getAllSales(
    userId: number,
    userPermissions: string[],
    startDate: string,
    endDate: string,
    warehouseId?: number,
    status?: 'PENDING' | 'APPROVED' | 'CANCELLED',
    isPaid?: boolean,
    page: number = 1,
    limit: number = 20
  ) {
    // Validar límites de paginación
    const validatedLimit = Math.min(Math.max(1, limit), 100); // Entre 1 y 100
    const validatedPage = Math.max(1, page);
    const hasReadAll = userPermissions.includes("sales.read");
    const hasCancel = userPermissions.includes("sales.cancel");
    const hasAccept = userPermissions.includes("sales.accept");
    const hasCreate = userPermissions.includes("sales.create");
    const hasPaid = userPermissions.includes("sales.paid");

    // Obtener establecimientos del usuario
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    const allowedWarehouseIds = userWarehousesData.map((w) => w.warehouseId);

    // Si el usuario no tiene establecimientos asignados, no puede ver nada
    if (allowedWarehouseIds.length === 0) {
      return {
        data: [],
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }

    // Condiciones base
    const baseConditions: any[] = [
      gte(sales.date, sql`${startDate}`),
      lte(sales.date, sql`${endDate}`)
    ];

    // Filtro por establecimiento: si especifica uno, verificar que tenga acceso
    // Si no especifica, filtrar por todos sus establecimientos
    if (warehouseId) {
      // Verificar que el usuario tenga acceso al establecimiento solicitado
      if (!allowedWarehouseIds.includes(warehouseId)) {
        return {
          data: [],
          pagination: {
            page: validatedPage,
            limit: validatedLimit,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
          }
        };
      }
      baseConditions.push(eq(sales.warehouseId, warehouseId));
    } else {
      // Sin filtro específico: mostrar de todos sus establecimientos
      baseConditions.push(inArray(sales.warehouseId, allowedWarehouseIds));
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

    // Si tiene sales.read → ve TODAS (dentro del rango, establecimientos y filtros)
    if (hasReadAll) {
      const [data, totalCount] = await Promise.all([
        this.getSalesWithUserNames(baseCondition, { page: validatedPage, limit: validatedLimit }),
        this.countSales(baseCondition)
      ]);
      return {
        data,
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / validatedLimit),
          hasNextPage: validatedPage < Math.ceil(totalCount / validatedLimit),
          hasPrevPage: validatedPage > 1
        }
      };
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
      return {
        data: [],
        pagination: {
          page: validatedPage,
          limit: validatedLimit,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      };
    }

    // Combinar: (permisos OR) AND (condiciones base incluyendo establecimientos)
    const finalCondition = and(baseCondition, or(...permissionConditions));
    const [data, totalCount] = await Promise.all([
      this.getSalesWithUserNames(finalCondition, { page: validatedPage, limit: validatedLimit }),
      this.countSales(finalCondition)
    ]);
    return {
      data,
      pagination: {
        page: validatedPage,
        limit: validatedLimit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / validatedLimit),
        hasNextPage: validatedPage < Math.ceil(totalCount / validatedLimit),
        hasPrevPage: validatedPage > 1
      }
    };
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
        productCode: products.code,
        minStock: products.minStock,
        quantity: salesDetail.quantity,
        unitPrice: salesDetail.unitPrice,
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
        productCode: products.code,
        minStock: products.minStock,
        quantity: salesDetail.quantity,
        unitPrice: salesDetail.unitPrice,
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

    return Object.assign({}, sale, { details });
  }

  // Aceptar factura de venta (consume lotes FIFO y calcula costo real) - con transacción
  async acceptSale(id: number, userId: number) {
    const sale = await this.getSaleByIdInternal(id);

    if (sale.status !== "PENDING") {
      throw new ValidationError("Solo se pueden aceptar facturas en estado PENDING");
    }

    // Revalidar stock al momento de aceptar (fuera de transacción para fallar rápido)
    for (const detail of sale.details) {
      await this.checkStock(sale.warehouseId, detail.productId, parseFloat(detail.quantity));
    }

    return await db.transaction(async (tx) => {
      // Actualizar estado de factura
      await tx
        .update(sales)
        .set({
          status: "APPROVED",
          acceptedBy: userId,
          acceptedAt: new Date(),
        })
        .where(eq(sales.id, id));

      // Procesar la venta (consumir lotes y calcular costos)
      await this.processApprovedSale(sale, tx);
    }).then(async () => {
      // Retornar la venta completa actualizada (FUERA de la transacción)
      const updatedSale = await this.getSaleById(id);
      return {
        message: "Factura de venta aceptada exitosamente. Lotes consumidos con FIFO.",
        data: updatedSale
      };
    });
  }

  // Cancelar factura de venta
  async cancelSale(id: number, cancellationReason: string, userId: number) {
    const sale = await this.getSaleByIdInternal(id);

    if (sale.status === "CANCELLED") {
      throw new ConflictError("La factura ya está cancelada");
    }

    const wasApproved = sale.status === "APPROVED";

    // Si estaba en PENDING, solo actualizar estado (sin transacción necesaria)
    if (!wasApproved) {
      await db
        .update(sales)
        .set({
          status: "CANCELLED",
          cancellationReason,
          cancelledBy: userId,
          cancelledAt: new Date(),
        })
        .where(eq(sales.id, id));

      // Retornar la venta completa actualizada
      const updatedSale = await this.getSaleById(id);
      return {
        message: "Factura cancelada exitosamente",
        data: updatedSale
      };
    }

    // Si estaba aprobada, ejecutar en transacción
    return await db.transaction(async (tx) => {
      // Actualizar estado
      await tx
        .update(sales)
        .set({
          status: "CANCELLED",
          cancellationReason,
          cancelledBy: userId,
          cancelledAt: new Date(),
        })
        .where(eq(sales.id, id));

      // Recrear lotes con el mismo costo
      for (const detail of sale.details) {
        // Obtener los consumos originales de esta línea
        const consumptions = await tx
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

          // Crear lote de devolución (pasando tx para atomicidad)
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
          }, undefined, tx);

          // Crear movimiento de reversión
          await tx.insert(inventoryMovements).values({
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
    }).then(async () => {
      // Retornar la venta completa actualizada (FUERA de la transacción)
      const updatedSale = await this.getSaleById(id);
      return {
        message: "Factura cancelada exitosamente",
        data: updatedSale
      };
    });
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
        date: sql<string>`DATE_FORMAT(${sales.date}, '%Y-%m-%d')`.as('date'),
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        currencyId: sales.currencyId,
        currencyCode: currencies.code,
        total: sales.total, // En moneda original de la factura
        customerName: sales.customerName,
        isPaid: sales.isPaid,
      })
      .from(sales)
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(sales.currencyId, currencies.id))
      .where(and(...conditions))
      .orderBy(desc(sales.date));

    // Calcular totales de cada venta (TODO en CUP para comparar correctamente)
    const salesWithTotals = await Promise.all(
      salesData.map(async (sale) => {
        const details = await db
          .select({
            quantity: salesDetail.quantity,
            convertedUnitPrice: salesDetail.convertedUnitPrice, // Precio en CUP
            unitPrice: salesDetail.unitPrice, // Precio original (si es CUP, no hay convertedUnitPrice)
            realCost: salesDetail.realCost,
            margin: salesDetail.margin,
          })
          .from(salesDetail)
          .where(eq(salesDetail.saleId, sale.id));

        // Usar convertedUnitPrice (en CUP) para calcular revenue, así es comparable con realCost
        // Si convertedUnitPrice es null, significa que la factura ya estaba en CUP
        const totalRevenue = details.reduce((sum, d) => {
          const qty = parseFloat(d.quantity);
          const priceInCUP = parseFloat(d.convertedUnitPrice || d.unitPrice);
          return sum + (qty * priceInCUP);
        }, 0);
        const totalCost = details.reduce((sum, d) => sum + parseFloat(d.realCost || "0"), 0);
        const totalMargin = details.reduce((sum, d) => sum + parseFloat(d.margin || "0"), 0);
        const marginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

        return {
          ...sale,
          // Todos estos valores están en CUP (moneda base) para poder comparar correctamente
          totalRevenueCUP: totalRevenue.toFixed(2),
          totalCostCUP: totalCost.toFixed(2),
          totalMarginCUP: totalMargin.toFixed(2),
          marginPercent: marginPercent.toFixed(2) + "%",
        };
      })
    );

    // Totales generales (en CUP)
    const overallRevenue = salesWithTotals.reduce((sum, s) => sum + parseFloat(s.totalRevenueCUP), 0);
    const overallCost = salesWithTotals.reduce((sum, s) => sum + parseFloat(s.totalCostCUP), 0);
    const overallMargin = salesWithTotals.reduce((sum, s) => sum + parseFloat(s.totalMarginCUP), 0);
    const overallMarginPercent = overallRevenue > 0 ? (overallMargin / overallRevenue) * 100 : 0;

    return {
      currency: "CUP", // Indicar que todos los valores monetarios están en CUP
      sales: salesWithTotals,
      summary: {
        totalSales: salesWithTotals.length,
        totalRevenueCUP: overallRevenue.toFixed(2),
        totalCostCUP: overallCost.toFixed(2),
        totalMarginCUP: overallMargin.toFixed(2),
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
  // NOTA: Para sumar totales correctamente, se deben convertir a CUP (moneda base)
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
        total: sales.total, // En moneda original de la factura
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

    // Calcular totales EN CUP para poder sumar diferentes monedas
    const totalSales = dailySales.length;
    const paidSales = dailySales.filter(s => s.isPaid).length;
    const unpaidSales = dailySales.filter(s => !s.isPaid).length;

    // Convertir cada venta a CUP y calcular total
    let totalRevenueCUP = 0;
    const salesWithConversion = await Promise.all(
      dailySales.map(async (sale) => {
        let totalInCUP = parseFloat(sale.total);
        let exchangeRateUsed: number | null = null;
        
        // Si la factura NO está en CUP, convertir
        if (sale.currencyId !== BASE_CURRENCY_ID) {
          try {
            const rate = await this.getExchangeRate(sale.currencyId, BASE_CURRENCY_ID, normalizedDate);
            if (rate) {
              totalInCUP = parseFloat(sale.total) * rate;
              exchangeRateUsed = rate;
            }
          } catch {
            // Si no hay tasa, mantener el valor original (no ideal pero evita error)
            // En producción deberían existir todas las tasas
          }
        }
        
        totalRevenueCUP += totalInCUP;
        
        return {
          ...sale,
          totalInCUP: totalInCUP.toFixed(2),
          exchangeRateUsed: exchangeRateUsed?.toFixed(4) || null,
        };
      })
    );

    // Agrupar ventas por moneda para mostrar subtotales
    const byMoneda: Record<string, { count: number; total: number }> = {};
    for (const sale of dailySales) {
      const code = sale.currencyCode;
      if (!byMoneda[code]) {
        byMoneda[code] = { count: 0, total: 0 };
      }
      byMoneda[code].count++;
      byMoneda[code].total += parseFloat(sale.total);
    }

    const subtotalsByMoneda = Object.entries(byMoneda).map(([code, data]) => ({
      currency: code,
      count: data.count,
      total: data.total.toFixed(2),
    }));

    return {
      date: normalizedDate,
      sales: salesWithConversion,
      summary: {
        totalSales,
        totalRevenueCUP: totalRevenueCUP.toFixed(2), // Total convertido a CUP
        subtotalsByMoneda, // Subtotales por cada moneda
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
    // Obtener establecimientos del usuario
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
        summary: { totalSales: 0, totalRevenue: "0.00", paidSales: 0, unpaidSales: 0 },
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
        date: sql<string>`DATE_FORMAT(${sales.date}, '%Y-%m-%d')`.as('date'),
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
    const salesWithMissingRate: string[] = []; // Facturas sin tasa de cambio

    const salesWithConversion = await Promise.all(
      periodSales.map(async (sale) => {
        let convertedTotal = parseFloat(sale.total);
        let exchangeRateUsed: number | null = null;
        let conversionWarning: string | null = null;
        
        if (sale.currencyId !== targetCurrencyId) {
          // Buscar tasa de cambio
          const saleDate = normalizeBusinessDate(sale.date);
          try {
            const rate = await this.getExchangeRate(sale.currencyId, targetCurrencyId, saleDate);
            if (rate) {
              convertedTotal = parseFloat(sale.total) * rate;
              exchangeRateUsed = rate;
            }
          } catch {
            // Si no hay tasa, marcar con advertencia (no incluir en total)
            conversionWarning = `Sin tasa de cambio para ${saleDate}`;
            salesWithMissingRate.push(sale.invoiceNumber);
            convertedTotal = 0; // No incluir en el total si no hay tasa
          }
        }
        
        totalRevenueConverted += convertedTotal;
        
        return {
          ...sale,
          convertedTotal: convertedTotal.toFixed(2),
          exchangeRateUsed: exchangeRateUsed?.toFixed(4) || null,
          conversionWarning,
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
        totalRevenue: totalRevenueConverted.toFixed(2),
        paidSales,
        unpaidSales,
        // Advertencia si hay facturas que no pudieron convertirse
        ...(salesWithMissingRate.length > 0 && {
          warning: `${salesWithMissingRate.length} factura(s) no incluidas en el total por falta de tasa de cambio: ${salesWithMissingRate.join(", ")}`,
        }),
      },
    };
  }

  // Obtener productos disponibles para vender en un establecimiento
  // Solo muestra productos con stock > 0 en el establecimiento
  // Verifica que el usuario tenga acceso al establecimiento
  async getAvailableProducts(
    userId: number,
    warehouseId: number,
    search?: string,
    categoryId?: number
  ) {
    // Verificar que el usuario tenga acceso al establecimiento
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    const allowedWarehouseIds = userWarehousesData.map((w) => w.warehouseId);

    if (!allowedWarehouseIds.includes(warehouseId)) {
      throw new ForbiddenError("No tienes acceso a este establecimiento");
    }

    // Obtener información del establecimiento
    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(eq(warehouses.id, warehouseId));

    if (!warehouse) {
      throw new NotFoundError("Establecimiento no encontrado");
    }

    // Obtener lotes activos (con stock > 0) del establecimiento
    // Agrupados por producto
    const lotsWithStock = await db
      .select({
        productId: inventoryLots.productId,
        totalStock: sql<string>`SUM(${inventoryLots.currentQuantity})`.as('total_stock'),
      })
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.warehouseId, warehouseId),
          eq(inventoryLots.status, "ACTIVE"),
          gt(inventoryLots.currentQuantity, "0")
        )
      )
      .groupBy(inventoryLots.productId);

    if (lotsWithStock.length === 0) {
      return {
        warehouse: { id: warehouse.id, name: warehouse.name },
        products: [],
      };
    }

    // Obtener IDs de productos con stock
    const productIdsWithStock = lotsWithStock.map(l => l.productId);

    // Construir condiciones de búsqueda
    const conditions: any[] = [inArray(products.id, productIdsWithStock)];

    // Filtro de búsqueda por nombre o código
    if (search) {
      conditions.push(
        or(
          like(products.name, `%${search}%`),
          like(products.code, `%${search}%`)
        )
      );
    }

    // Filtro por categoría
    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    // Obtener productos con sus detalles
    const productsData = await db
      .select({
        id: products.id,
        name: products.name,
        code: products.code,
        description: products.description,
        salePrice: products.salePrice,
        costPrice: products.costPrice,
        currencyId: products.currencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        unitId: products.unitId,
        unitName: units.name,
        unitShortName: units.shortName,
        unitType: units.type,
        categoryId: products.categoryId,
        categoryName: categories.name,
        minStock: products.minStock,
        reorderPoint: products.reorderPoint,
      })
      .from(products)
      .innerJoin(currencies, eq(products.currencyId, currencies.id))
      .innerJoin(units, eq(products.unitId, units.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(products.name);

    // Combinar productos con su stock disponible
    const productsWithStock = productsData.map(product => {
      const stockInfo = lotsWithStock.find(l => l.productId === product.id);
      return {
        ...product,
        availableStock: stockInfo ? parseFloat(stockInfo.totalStock).toFixed(2) : "0.00",
      };
    });

    return {
      warehouse: { id: warehouse.id, name: warehouse.name },
      products: productsWithStock,
    };
  }

  // Obtener establecimientos activos disponibles para el usuario (para selector de venta)
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

  // Verificar tasas de cambio disponibles para una fecha específica
  // Si se pasa date, requiere permiso sales.backdate
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
        if (!userPermissions.includes("sales.backdate")) {
          throw new Error(
            "No tienes permiso para consultar tasas de cambio de fechas anteriores. " +
            "Requiere permiso: sales.backdate"
          );
        }
        targetDate = date;
      }
    }
    
    // Obtener todas las monedas activas (excepto CUP que no necesita tasa)
    const allCurrencies = await db
      .select({
        id: currencies.id,
        symbol: currencies.symbol,
        name: currencies.name,
        code: currencies.code,
      })
      .from(currencies);

    // Obtener las tasas de cambio del día objetivo
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
    const canCreateSale = selectedCurrency?.hasExchangeRate ?? false;

    // Verificar qué monedas de productos podrían causar problemas
    const missingRates = currencyStatus.filter((c) => !c.hasExchangeRate);

    const isBackdate = targetDate !== today;

    return {
      date: targetDate,
      isBackdate,
      invoiceCurrency: selectedCurrency,
      canCreateSale,
      allCurrencies: currencyStatus,
      missingRates,
      message: canCreateSale
        ? isBackdate
          ? `Puede crear ventas retroactivas con esta moneda para el ${targetDate}`
          : "Puede crear ventas con esta moneda"
        : `No hay tasa de cambio para ${selectedCurrency?.symbol || "la moneda seleccionada"} el día ${targetDate}`,
    };
  }

  // Obtener monedas activas
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

  // Obtener tipos de pago activos
  async getPaymentTypes() {
    return await db
      .select({
        id: paymentTypes.id,
        type: paymentTypes.type,
        description: paymentTypes.description,
      })
      .from(paymentTypes)
      .where(eq(paymentTypes.isActive, true))
      .orderBy(paymentTypes.type);
  }

  // Obtener categorías activas
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

  // ========== REPORTE AVANZADO DE VENTAS ==========
  // Endpoint que retorna ventas filtradas + opciones de filtro para el frontend
  async getSalesReport(
    userId: number,
    userPermissions: string[],
    filters: {
      startDate: string;
      endDate: string;
      warehouseId?: number;
      productId?: number;
      categoryId?: number;
      currencyId?: number;
      paymentTypeId?: number;
      status?: 'PENDING' | 'APPROVED' | 'CANCELLED';
      isPaid?: boolean;
      createdById?: number;
      customerId?: string; // Buscar por nombre de cliente
      invoiceNumber?: string; // Buscar por número de factura
      page?: number;
      limit?: number;
    }
  ) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(Math.max(1, filters.limit || 20), 100);
    
    // Obtener establecimientos del usuario
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    const allowedWarehouseIds = userWarehousesData.map((w) => w.warehouseId);

    if (allowedWarehouseIds.length === 0) {
      return this.buildEmptyReportResponse();
    }

    // Construir condiciones de filtro
    const conditions: any[] = [
      gte(sales.date, sql`${filters.startDate}`),
      lte(sales.date, sql`${filters.endDate}`),
    ];

    // Filtro por establecimiento (validar que tenga acceso)
    if (filters.warehouseId) {
      if (!allowedWarehouseIds.includes(filters.warehouseId)) {
        throw new ForbiddenError("No tienes acceso a este establecimiento");
      }
      conditions.push(eq(sales.warehouseId, filters.warehouseId));
    } else {
      conditions.push(inArray(sales.warehouseId, allowedWarehouseIds));
    }

    // Filtro por moneda
    if (filters.currencyId) {
      conditions.push(eq(sales.currencyId, filters.currencyId));
    }

    // Filtro por tipo de pago (a nivel de factura)
    if (filters.paymentTypeId) {
      conditions.push(eq(sales.paymentTypeId, filters.paymentTypeId));
    }

    // Filtro por estado
    if (filters.status) {
      conditions.push(eq(sales.status, filters.status));
    }

    // Filtro por estado de pago (solo si tiene permiso sales.paid)
    const hasPaidPermission = userPermissions.includes("sales.paid");
    if (filters.isPaid !== undefined && hasPaidPermission) {
      conditions.push(eq(sales.isPaid, filters.isPaid));
    }

    // Filtro por usuario que creó
    if (filters.createdById) {
      conditions.push(eq(sales.createdBy, filters.createdById));
    }

    // Filtro por nombre de cliente (búsqueda parcial)
    if (filters.customerId) {
      conditions.push(like(sales.customerName, `%${filters.customerId}%`));
    }

    // Filtro por número de factura (búsqueda parcial)
    if (filters.invoiceNumber) {
      conditions.push(like(sales.invoiceNumber, `%${filters.invoiceNumber}%`));
    }

    // Filtros de permisos (quién puede ver qué)
    const hasReadAll = userPermissions.includes("sales.read");
    const hasCancel = userPermissions.includes("sales.cancel");
    const hasAccept = userPermissions.includes("sales.accept");
    const hasCreate = userPermissions.includes("sales.create");

    if (!hasReadAll) {
      const permissionConditions: any[] = [];
      
      // hasCancel: puede ver PENDING y APPROVED
      // hasAccept: puede ver PENDING
      // Si tiene hasCancel, ya cubre PENDING, no necesita hasAccept
      if (hasCancel) {
        permissionConditions.push(
          inArray(sales.status, ["PENDING", "APPROVED"])
        );
      } else if (hasAccept) {
        permissionConditions.push(eq(sales.status, "PENDING"));
      }
      
      // hasCreate: puede ver las que creó (cualquier estado)
      if (hasCreate) {
        permissionConditions.push(eq(sales.createdBy, userId));
      }

      if (permissionConditions.length > 0) {
        conditions.push(or(...permissionConditions));
      } else {
        return this.buildEmptyReportResponse();
      }
    }

    // Si hay filtro por producto o categoría, buscar en los detalles
    if (filters.productId || filters.categoryId) {
      let detailConditions: any[] = [];
      
      if (filters.productId) {
        detailConditions.push(eq(salesDetail.productId, filters.productId));
      }
      
      if (filters.categoryId) {
        // Obtener productos de la categoría
        const categoryProducts = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.categoryId, filters.categoryId));
        
        if (categoryProducts.length === 0) {
          return this.buildEmptyReportResponse();
        }
        
        detailConditions.push(
          inArray(salesDetail.productId, categoryProducts.map(p => p.id))
        );
      }

      // Buscar ventas que cumplan con los filtros de detalle
      const salesWithDetailFilter = await db
        .select({ saleId: salesDetail.saleId })
        .from(salesDetail)
        .where(and(...detailConditions))
        .groupBy(salesDetail.saleId);
      
      const filteredSaleIds = salesWithDetailFilter.map(s => s.saleId);
      
      if (filteredSaleIds.length === 0) {
        return this.buildEmptyReportResponse();
      }
      
      conditions.push(inArray(sales.id, filteredSaleIds));
    }

    const whereCondition = and(...conditions);

    // Contar total de registros
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sales)
      .where(whereCondition);
    
    const totalRecords = Number(countResult?.count || 0);
    const totalPages = Math.ceil(totalRecords / limit);

    // Obtener ventas paginadas
    const salesData = await db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        customerName: sales.customerName,
        customerPhone: sales.customerPhone,
        date: sql<string>`DATE_FORMAT(${sales.date}, '%Y-%m-%d')`.as('date'),
        warehouseId: sales.warehouseId,
        warehouseName: warehouses.name,
        currencyId: sales.currencyId,
        currencyCode: currencies.code,
        currencySymbol: currencies.symbol,
        paymentTypeId: sales.paymentTypeId,
        paymentTypeName: paymentTypes.type,
        status: sales.status,
        subtotal: sales.subtotal,
        total: sales.total,
        isPaid: sales.isPaid,
        createdBy: sales.createdBy,
        createdByName: sql<string>`CONCAT(${createdByUser.nombre}, ' ', COALESCE(${createdByUser.apellido}, ''))`.as('created_by_name'),
        createdAt: sales.createdAt,
        acceptedAt: sales.acceptedAt,
        cancelledAt: sales.cancelledAt,
      })
      .from(sales)
      .innerJoin(warehouses, eq(sales.warehouseId, warehouses.id))
      .innerJoin(currencies, eq(sales.currencyId, currencies.id))
      .innerJoin(createdByUser, eq(sales.createdBy, createdByUser.id))
      .leftJoin(paymentTypes, eq(sales.paymentTypeId, paymentTypes.id))
      .where(whereCondition)
      .orderBy(desc(sales.date), desc(sales.id))
      .limit(limit)
      .offset((page - 1) * limit);

    // Calcular totales del reporte (convertidos a CUP)
    const reportTotals = await this.calculateReportTotals(whereCondition, filters.startDate);

    // Obtener opciones de filtro (pasamos permisos para filtrar opciones según acceso)
    const filterOptions = await this.getReportFilterOptions(userId, allowedWarehouseIds, userPermissions);

    return {
      // Datos de ventas
      sales: salesData,
      
      // Paginación
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      
      // Resumen del reporte (en CUP para comparabilidad)
      summary: reportTotals,
      
      // Opciones de filtro para el frontend
      filterOptions,
      
      // Filtros aplicados (para referencia)
      appliedFilters: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        warehouseId: filters.warehouseId || null,
        productId: filters.productId || null,
        categoryId: filters.categoryId || null,
        currencyId: filters.currencyId || null,
        paymentTypeId: filters.paymentTypeId || null,
        status: filters.status || null,
        isPaid: filters.isPaid ?? null,
        createdById: filters.createdById || null,
        customerId: filters.customerId || null,
        invoiceNumber: filters.invoiceNumber || null,
      },
    };
  }

  // Calcular totales del reporte
  private async calculateReportTotals(whereCondition: any, referenceDate: string) {
    // Obtener todas las ventas que coinciden con el filtro
    const matchingSales = await db
      .select({
        id: sales.id,
        currencyId: sales.currencyId,
        currencyCode: currencies.code,
        total: sales.total,
        status: sales.status,
        isPaid: sales.isPaid,
        date: sql<string>`DATE_FORMAT(${sales.date}, '%Y-%m-%d')`.as('date'),
      })
      .from(sales)
      .innerJoin(currencies, eq(sales.currencyId, currencies.id))
      .where(whereCondition);

    let totalApprovedCUP = 0;
    let totalPendingCUP = 0;
    let totalCancelledCUP = 0;
    let totalPaidCUP = 0;
    let totalUnpaidCUP = 0;
    
    let countApproved = 0;
    let countPending = 0;
    let countCancelled = 0;
    let countPaid = 0;
    let countUnpaid = 0;

    // Agrupar por moneda
    const byCurrency: Record<string, { 
      currencyId: number;
      code: string;
      count: number; 
      total: number;
      approved: { count: number; total: number };
      pending: { count: number; total: number };
      cancelled: { count: number; total: number };
      paid: { count: number; total: number };
      unpaid: { count: number; total: number };
    }> = {};

    for (const sale of matchingSales) {
      let totalInCUP = parseFloat(sale.total);
      const saleTotal = parseFloat(sale.total);
      
      // Inicializar moneda si no existe
      if (!byCurrency[sale.currencyCode]) {
        byCurrency[sale.currencyCode] = {
          currencyId: sale.currencyId,
          code: sale.currencyCode,
          count: 0,
          total: 0,
          approved: { count: 0, total: 0 },
          pending: { count: 0, total: 0 },
          cancelled: { count: 0, total: 0 },
          paid: { count: 0, total: 0 },
          unpaid: { count: 0, total: 0 },
        };
      }
      
      // Sumar a la moneda
      byCurrency[sale.currencyCode].count++;
      byCurrency[sale.currencyCode].total += saleTotal;
      
      // Convertir a CUP si es necesario
      if (sale.currencyId !== BASE_CURRENCY_ID) {
        try {
          const saleDate = normalizeBusinessDate(sale.date);
          const rate = await this.getExchangeRate(sale.currencyId, BASE_CURRENCY_ID, saleDate);
          if (rate) {
            totalInCUP = parseFloat(sale.total) * rate;
          }
        } catch {
          // Si no hay tasa, usar el valor sin convertir (no ideal)
        }
      }

      // Sumar por estado (totales en CUP y por moneda)
      switch (sale.status) {
        case "APPROVED":
          totalApprovedCUP += totalInCUP;
          countApproved++;
          byCurrency[sale.currencyCode].approved.count++;
          byCurrency[sale.currencyCode].approved.total += saleTotal;
          if (sale.isPaid) {
            totalPaidCUP += totalInCUP;
            countPaid++;
            byCurrency[sale.currencyCode].paid.count++;
            byCurrency[sale.currencyCode].paid.total += saleTotal;
          } else {
            totalUnpaidCUP += totalInCUP;
            countUnpaid++;
            byCurrency[sale.currencyCode].unpaid.count++;
            byCurrency[sale.currencyCode].unpaid.total += saleTotal;
          }
          break;
        case "PENDING":
          totalPendingCUP += totalInCUP;
          countPending++;
          byCurrency[sale.currencyCode].pending.count++;
          byCurrency[sale.currencyCode].pending.total += saleTotal;
          break;
        case "CANCELLED":
          totalCancelledCUP += totalInCUP;
          countCancelled++;
          byCurrency[sale.currencyCode].cancelled.count++;
          byCurrency[sale.currencyCode].cancelled.total += saleTotal;
          break;
      }
    }

    // Formatear totales por moneda
    const totalsByCurrency = Object.values(byCurrency).map(c => ({
      currencyId: c.currencyId,
      code: c.code,
      count: c.count,
      total: c.total.toFixed(2),
      approved: { count: c.approved.count, total: c.approved.total.toFixed(2) },
      pending: { count: c.pending.count, total: c.pending.total.toFixed(2) },
      cancelled: { count: c.cancelled.count, total: c.cancelled.total.toFixed(2) },
      paid: { count: c.paid.count, total: c.paid.total.toFixed(2) },
      unpaid: { count: c.unpaid.count, total: c.unpaid.total.toFixed(2) },
    }));

    return {
      // Totales convertidos a CUP (para comparabilidad)
      currency: "CUP",
      totalSales: matchingSales.length,
      
      approved: {
        count: countApproved,
        totalCUP: totalApprovedCUP.toFixed(2),
      },
      pending: {
        count: countPending,
        totalCUP: totalPendingCUP.toFixed(2),
      },
      cancelled: {
        count: countCancelled,
        totalCUP: totalCancelledCUP.toFixed(2),
      },
      paid: {
        count: countPaid,
        totalCUP: totalPaidCUP.toFixed(2),
      },
      unpaid: {
        count: countUnpaid,
        totalCUP: totalUnpaidCUP.toFixed(2),
      },
      
      // Totales desglosados por moneda original
      byCurrency: totalsByCurrency,
    };
  }

  // Obtener opciones de filtro para el frontend
  private async getReportFilterOptions(userId: number, allowedWarehouseIds: number[], userPermissions: string[]) {
    const hasPaidPermission = userPermissions.includes("sales.paid");
    
    // establecimientos del usuario
    const warehouseOptions = await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
      })
      .from(warehouses)
      .where(
        and(
          inArray(warehouses.id, allowedWarehouseIds),
          eq(warehouses.active, true)
        )
      )
      .orderBy(warehouses.name);

    // Categorías activas
    const categoryOptions = await db
      .select({
        id: categories.id,
        name: categories.name,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.name);

    // Monedas activas
    const currencyOptions = await db
      .select({
        id: currencies.id,
        name: currencies.name,
        code: currencies.code,
        symbol: currencies.symbol,
      })
      .from(currencies)
      .where(eq(currencies.isActive, true))
      .orderBy(currencies.name);

    // Tipos de pago activos
    const paymentTypeOptions = await db
      .select({
        id: paymentTypes.id,
        name: paymentTypes.type,
      })
      .from(paymentTypes)
      .where(eq(paymentTypes.isActive, true))
      .orderBy(paymentTypes.type);

    // Estados posibles
    const statusOptions = [
      { id: "PENDING", name: "Pendiente" },
      { id: "APPROVED", name: "Aprobada" },
      { id: "CANCELLED", name: "Cancelada" },
    ];

    // Estados de pago (solo si tiene permiso sales.paid)
    const isPaidOptions = hasPaidPermission ? [
      { id: "true", name: "Pagada" },
      { id: "false", name: "No pagada" },
    ] : [];

    // Usuarios que han creado ventas en los establecimientos del usuario
    const creatorOptions = await db
      .select({
        id: users.id,
        name: sql<string>`CONCAT(${users.nombre}, ' ', COALESCE(${users.apellido}, ''))`.as('name'),
      })
      .from(users)
      .innerJoin(sales, eq(sales.createdBy, users.id))
      .where(inArray(sales.warehouseId, allowedWarehouseIds))
      .groupBy(users.id, users.nombre, users.apellido)
      .orderBy(users.nombre);

    // Productos que se han vendido (para mostrar solo relevantes)
    const productOptions = await db
      .select({
        id: products.id,
        name: products.name,
        code: products.code,
        categoryId: products.categoryId,
        categoryName: categories.name,
      })
      .from(products)
      .innerJoin(salesDetail, eq(salesDetail.productId, products.id))
      .innerJoin(sales, eq(sales.id, salesDetail.saleId))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(inArray(sales.warehouseId, allowedWarehouseIds))
      .groupBy(products.id, products.name, products.code, products.categoryId, categories.name)
      .orderBy(products.name);

    return {
      warehouses: warehouseOptions,
      categories: categoryOptions,
      currencies: currencyOptions,
      paymentTypes: paymentTypeOptions,
      statuses: statusOptions,
      // Solo incluir isPaidOptions si tiene permiso sales.paid
      ...(hasPaidPermission && { isPaidOptions }),
      creators: creatorOptions,
      products: productOptions,
    };
  }

  // Construir respuesta vacía para el reporte
  private buildEmptyReportResponse() {
    return {
      sales: [],
      pagination: {
        page: 1,
        limit: 20,
        totalRecords: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
      summary: {
        currency: "CUP",
        totalSales: 0,
        approved: { count: 0, totalCUP: "0.00" },
        pending: { count: 0, totalCUP: "0.00" },
        cancelled: { count: 0, totalCUP: "0.00" },
        paid: { count: 0, totalCUP: "0.00" },
        unpaid: { count: 0, totalCUP: "0.00" },
        byCurrency: [],
      },
      filterOptions: {
        warehouses: [],
        categories: [],
        currencies: [],
        paymentTypes: [],
        statuses: [],
        creators: [],
        products: [],
      },
      appliedFilters: {},
    };
  }
}
