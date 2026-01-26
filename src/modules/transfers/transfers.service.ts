import { db } from "../../db/connection";
import { transfers } from "../../db/schema/transfers";
import { transfersDetail } from "../../db/schema/transfers_detail";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { lotConsumptions } from "../../db/schema/lot_consumptions";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { users } from "../../db/schema/users";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { categories } from "../../db/schema/categories";
import { units } from "../../db/schema/units";
import { eq, and, or, desc, sql, gte, lte, gt, asc, inArray, aliasedTable } from "drizzle-orm";
import { normalizeBusinessDate, getTodayDateString } from "../../utils/date";
import { NotFoundError, ValidationError, ForbiddenError } from "../../utils/errors";
import { lotService } from "../inventory/lots.service";

// Alias para usuarios (múltiples joins a la misma tabla)
const createdByUser = aliasedTable(users, "created_by_user");
const approvedByUser = aliasedTable(users, "approved_by_user");
const rejectedByUser = aliasedTable(users, "rejected_by_user");
const cancelledByUser = aliasedTable(users, "cancelled_by_user");

export class TransfersService {
  // Generar número de traslado con lock para evitar duplicados
  private async generateTransferNumber(tx?: any): Promise<string> {
    const database = tx || db;
    const year = new Date().getFullYear();
    const [lastTransfer] = await database
      .select()
      .from(transfers)
      .where(sql`transfer_number LIKE ${`TR-${year}%`}`)
      .orderBy(desc(transfers.id))
      .limit(1)
      .for("update");

    let nextNumber = 1;
    if (lastTransfer) {
      const lastNumber = parseInt(lastTransfer.transferNumber.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    return `TR-${year}-${nextNumber.toString().padStart(5, "0")}`;
  }

  // Verificar stock disponible en origen (desde lotes)
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
      throw new ForbiddenError(`No tienes permiso para operar en este almacén`);
    }
  }

  // Obtener almacenes asignados al usuario
  private async getUserWarehouseIds(userId: number): Promise<number[]> {
    const userWarehousesData = await db
      .select({ warehouseId: userWarehouses.warehouseId })
      .from(userWarehouses)
      .where(eq(userWarehouses.userId, userId));

    return userWarehousesData.map((w) => w.warehouseId);
  }

  // ========== ENDPOINTS AUXILIARES PARA FRONTEND ==========

  // Obtener almacenes origen (solo los asignados al usuario)
  async getOriginWarehouses(userId: number) {
    const userWarehouseIds = await this.getUserWarehouseIds(userId);
    
    if (userWarehouseIds.length === 0) {
      return [];
    }

    return await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
        direccion: warehouses.direccion,
      })
      .from(warehouses)
      .where(
        and(
          inArray(warehouses.id, userWarehouseIds),
          eq(warehouses.active, true)
        )
      )
      .orderBy(warehouses.name);
  }

  // Obtener almacenes destino (todos los activos)
  async getDestinationWarehouses() {
    return await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
        direccion: warehouses.direccion,
      })
      .from(warehouses)
      .where(eq(warehouses.active, true))
      .orderBy(warehouses.name);
  }

  // Obtener productos con stock disponible en un almacén
  async getAvailableProducts(userId: number, warehouseId: number, search?: string, categoryId?: number) {
    // Validar que el usuario tiene acceso al almacén origen
    await this.validateUserBelongsToWarehouse(userId, warehouseId);

    // Obtener productos con stock en el almacén
    const conditions: any[] = [
      eq(inventoryLots.warehouseId, warehouseId),
      eq(inventoryLots.status, "ACTIVE"),
      gt(inventoryLots.currentQuantity, "0"),
    ];

    if (categoryId) {
      conditions.push(eq(products.categoryId, categoryId));
    }

    const lotsData = await db
      .select({
        productId: inventoryLots.productId,
        productName: products.name,
        productCode: products.code,
        categoryId: products.categoryId,
        categoryName: categories.name,
        unitId: products.unitId,
        unitName: units.name,
        unitShortName: units.shortName,
        availableStock: sql<string>`SUM(${inventoryLots.currentQuantity})`.as('available_stock'),
      })
      .from(inventoryLots)
      .innerJoin(products, eq(inventoryLots.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(units, eq(products.unitId, units.id))
      .where(and(...conditions))
      .groupBy(inventoryLots.productId, products.id, categories.id, units.id);

    let result = lotsData;

    // Filtrar por búsqueda si se especifica
    if (search) {
      const searchLower = search.toLowerCase();
      result = lotsData.filter(
        (p) =>
          p.productName.toLowerCase().includes(searchLower) ||
          p.productCode.toLowerCase().includes(searchLower)
      );
    }

    return result.map((p) => ({
      id: p.productId,
      code: p.productCode,
      name: p.productName,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      unitId: p.unitId,
      unitName: p.unitName,
      unitShortName: p.unitShortName,
      availableStock: p.availableStock,
    }));
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

  // ========== CREAR TRASLADO ==========
  async createTransfer(data: {
    date?: string;
    backdateReason?: string;
    originWarehouseId: number;
    destinationWarehouseId: number;
    notes?: string;
    details: Array<{
      productId: number;
      quantity: number;
    }>;
    userId: number;
    userPermissions: string[];
  }) {
    if (data.originWarehouseId === data.destinationWarehouseId) {
      throw new ValidationError("El almacén de origen y destino no pueden ser el mismo");
    }

    // Validar que hay al menos un detalle
    if (!data.details || data.details.length === 0) {
      throw new ValidationError("El traslado debe tener al menos un producto");
    }

    // Validar cantidades
    for (let i = 0; i < data.details.length; i++) {
      const detail = data.details[i];
      if (detail.quantity <= 0) {
        throw new ValidationError(`La cantidad del producto en línea ${i + 1} debe ser mayor a 0`);
      }
    }

    // Validaciones previas
    await this.validateWarehouseExists(data.originWarehouseId);
    await this.validateWarehouseExists(data.destinationWarehouseId);
    
    // Validar que el usuario pertenece al almacén ORIGEN
    await this.validateUserBelongsToWarehouse(data.userId, data.originWarehouseId);

    // Fecha del traslado: usar la proporcionada o la fecha actual
    const today = getTodayDateString();
    const transferDate = data.date ? normalizeBusinessDate(data.date) : today;
    const isBackdated = transferDate < today;
    
    // Validar fecha retroactiva
    if (isBackdated) {
      if (!data.userPermissions.includes("transfers.backdate")) {
        throw new ForbiddenError(
          "No tiene permiso para crear traslados con fecha retroactiva. Requiere el permiso 'transfers.backdate'."
        );
      }
      
      if (!data.backdateReason || data.backdateReason.trim().length < 10) {
        throw new ValidationError(
          "Debe proporcionar un motivo para la fecha retroactiva (mínimo 10 caracteres) en el campo 'backdateReason'."
        );
      }
    }
    
    // Validar que la fecha no sea futura
    if (transferDate > today) {
      throw new ValidationError("No se pueden registrar traslados con fecha futura");
    }

    // Validar que los productos existen
    for (const detail of data.details) {
      const [product] = await db.select().from(products).where(eq(products.id, detail.productId));
      if (!product) {
        throw new NotFoundError(`Producto con ID ${detail.productId} no encontrado`);
      }
    }

    // Validar stock para todos los productos
    for (const detail of data.details) {
      await this.checkStock(data.originWarehouseId, detail.productId, detail.quantity);
    }

    // Preparar notas con motivo de fecha retroactiva si aplica
    let finalNotes = data.notes || "";
    if (isBackdated) {
      const backdateNote = `[FECHA RETROACTIVA: ${data.backdateReason}]`;
      finalNotes = finalNotes ? `${backdateNote} ${finalNotes}` : backdateNote;
    }

    // Ejecutar en transacción
    return await db.transaction(async (tx) => {
      // Generar número de traslado
      const transferNumber = await this.generateTransferNumber(tx);

      // Crear traslado
      const [transfer] = (await tx.insert(transfers).values({
        transferNumber,
        date: sql`${transferDate}`,
        originWarehouseId: data.originWarehouseId,
        destinationWarehouseId: data.destinationWarehouseId,
        status: "PENDING",
        notes: finalNotes || null,
        createdBy: data.userId,
      })) as any;

      const transferId = transfer.insertId;

      // Insertar detalles
      for (const detail of data.details) {
        await tx.insert(transfersDetail).values({
          transferId,
          productId: detail.productId,
          quantity: detail.quantity.toString(),
        });
      }

      return transferId;
    }).then(async (transferId) => {
      const completeTransfer = await this.getTransferById(transferId);
      return {
        message: "Traslado creado exitosamente. Pendiente de aprobación por el almacén destino.",
        data: completeTransfer
      };
    });
  }

  // ========== OBTENER TODOS LOS TRASLADOS ==========
  async getAllTransfers(
    userId: number,
    startDate: string,
    endDate?: string,
    warehouseId?: number,
    status?: string
  ) {
    const userWarehouseIds = await this.getUserWarehouseIds(userId);
    
    if (userWarehouseIds.length === 0) {
      return [];
    }

    const conditions: any[] = [
      gte(transfers.date, sql`${startDate}`),
      lte(transfers.date, sql`${endDate || startDate}`),
      // Siempre filtrar por almacenes del usuario (origen o destino)
      or(
        inArray(transfers.originWarehouseId, userWarehouseIds),
        inArray(transfers.destinationWarehouseId, userWarehouseIds)
      ),
    ];

    if (warehouseId) {
      conditions.push(
        or(
          eq(transfers.originWarehouseId, warehouseId),
          eq(transfers.destinationWarehouseId, warehouseId)
        )
      );
    }

    if (status) {
      conditions.push(eq(transfers.status, status as any));
    }

    const originWarehouse = aliasedTable(warehouses, "origin_warehouse");
    const destWarehouse = aliasedTable(warehouses, "dest_warehouse");

    return await db
      .select({
        id: transfers.id,
        transferNumber: transfers.transferNumber,
        date: transfers.date,
        originWarehouseId: transfers.originWarehouseId,
        originWarehouseName: originWarehouse.name,
        destinationWarehouseId: transfers.destinationWarehouseId,
        destinationWarehouseName: destWarehouse.name,
        status: transfers.status,
        notes: transfers.notes,
        createdAt: transfers.createdAt,
        createdBy: transfers.createdBy,
        createdByName: createdByUser.nombre,
        approvedBy: transfers.approvedBy,
        approvedByName: approvedByUser.nombre,
        approvedAt: transfers.approvedAt,
        rejectedBy: transfers.rejectedBy,
        rejectedByName: rejectedByUser.nombre,
        rejectedAt: transfers.rejectedAt,
        cancelledBy: transfers.cancelledBy,
        cancelledByName: cancelledByUser.nombre,
        cancelledAt: transfers.cancelledAt,
      })
      .from(transfers)
      .innerJoin(originWarehouse, eq(transfers.originWarehouseId, originWarehouse.id))
      .innerJoin(destWarehouse, eq(transfers.destinationWarehouseId, destWarehouse.id))
      .leftJoin(createdByUser, eq(transfers.createdBy, createdByUser.id))
      .leftJoin(approvedByUser, eq(transfers.approvedBy, approvedByUser.id))
      .leftJoin(rejectedByUser, eq(transfers.rejectedBy, rejectedByUser.id))
      .leftJoin(cancelledByUser, eq(transfers.cancelledBy, cancelledByUser.id))
      .where(and(...conditions))
      .orderBy(desc(transfers.createdAt));
  }

  // ========== OBTENER TRASLADO POR ID ==========
  async getTransferById(id: number) {
    const originWarehouse = aliasedTable(warehouses, "origin_warehouse");
    const destWarehouse = aliasedTable(warehouses, "dest_warehouse");

    const [transfer] = await db
      .select({
        id: transfers.id,
        transferNumber: transfers.transferNumber,
        date: transfers.date,
        originWarehouseId: transfers.originWarehouseId,
        originWarehouseName: originWarehouse.name,
        destinationWarehouseId: transfers.destinationWarehouseId,
        destinationWarehouseName: destWarehouse.name,
        status: transfers.status,
        notes: transfers.notes,
        rejectionReason: transfers.rejectionReason,
        cancellationReason: transfers.cancellationReason,
        createdAt: transfers.createdAt,
        createdBy: transfers.createdBy,
        createdByName: createdByUser.nombre,
        approvedBy: transfers.approvedBy,
        approvedByName: approvedByUser.nombre,
        approvedAt: transfers.approvedAt,
        rejectedBy: transfers.rejectedBy,
        rejectedByName: rejectedByUser.nombre,
        rejectedAt: transfers.rejectedAt,
        cancelledBy: transfers.cancelledBy,
        cancelledByName: cancelledByUser.nombre,
        cancelledAt: transfers.cancelledAt,
      })
      .from(transfers)
      .innerJoin(originWarehouse, eq(transfers.originWarehouseId, originWarehouse.id))
      .innerJoin(destWarehouse, eq(transfers.destinationWarehouseId, destWarehouse.id))
      .leftJoin(createdByUser, eq(transfers.createdBy, createdByUser.id))
      .leftJoin(approvedByUser, eq(transfers.approvedBy, approvedByUser.id))
      .leftJoin(rejectedByUser, eq(transfers.rejectedBy, rejectedByUser.id))
      .leftJoin(cancelledByUser, eq(transfers.cancelledBy, cancelledByUser.id))
      .where(eq(transfers.id, id));

    if (!transfer) {
      throw new NotFoundError("Traslado no encontrado");
    }

    const details = await db
      .select({
        id: transfersDetail.id,
        productId: transfersDetail.productId,
        productName: products.name,
        productCode: products.code,
        quantity: transfersDetail.quantity,
        unitName: units.name,
        unitShortName: units.shortName,
      })
      .from(transfersDetail)
      .innerJoin(products, eq(transfersDetail.productId, products.id))
      .leftJoin(units, eq(products.unitId, units.id))
      .where(eq(transfersDetail.transferId, id));

    return { ...transfer, details };
  }

  // ========== ACEPTAR TRASLADO ==========
  async acceptTransfer(id: number, userId: number) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== "PENDING") {
      throw new ValidationError("Solo se pueden aceptar traslados en estado PENDING");
    }

    // Validar que el usuario pertenece al almacén DESTINO
    await this.validateUserBelongsToWarehouse(userId, transfer.destinationWarehouseId);

    // Revalidar stock al momento de aceptar
    for (const detail of transfer.details) {
      await this.checkStock(
        transfer.originWarehouseId,
        detail.productId,
        parseFloat(detail.quantity)
      );
    }

    // Ejecutar en transacción
    return await db.transaction(async (tx) => {
      // Actualizar estado de traslado
      await tx
        .update(transfers)
        .set({
          status: "APPROVED",
          approvedBy: userId,
          approvedAt: new Date(),
        })
        .where(eq(transfers.id, id));

      // Procesar cada línea de detalle
      for (const detail of transfer.details) {
        const quantity = parseFloat(detail.quantity);
        const transferRef = `${transfer.transferNumber}`;

        // Obtener lotes FIFO del origen
        const originLots = await tx
          .select()
          .from(inventoryLots)
          .where(
            and(
              eq(inventoryLots.productId, detail.productId),
              eq(inventoryLots.warehouseId, transfer.originWarehouseId),
              eq(inventoryLots.status, "ACTIVE"),
              gt(inventoryLots.currentQuantity, "0")
            )
          )
          .orderBy(asc(inventoryLots.entryDate), asc(inventoryLots.id));

        let remainingQuantity = quantity;

        for (const lot of originLots) {
          if (remainingQuantity <= 0) break;

          const lotQty = parseFloat(lot.currentQuantity);
          const toTransfer = Math.min(lotQty, remainingQuantity);
          const isCompleteLot = toTransfer >= lotQty;

          if (isCompleteLot) {
            // Traslado completo: mover el lote íntegro
            await lotService.moveLotToWarehouse(lot.id, transfer.destinationWarehouseId, tx);

            // Registrar movimientos
            await tx.insert(inventoryMovements).values({
              type: "TRANSFER_EXIT",
              status: "APPROVED",
              warehouseId: transfer.originWarehouseId,
              productId: detail.productId,
              quantity: lot.currentQuantity,
              reference: transferRef,
              reason: `Traslado completo de lote ${lot.lotCode}`,
              lotId: lot.id,
            });

            await tx.insert(inventoryMovements).values({
              type: "TRANSFER_ENTRY",
              status: "APPROVED",
              warehouseId: transfer.destinationWarehouseId,
              productId: detail.productId,
              quantity: lot.currentQuantity,
              reference: transferRef,
              reason: `Recepción de lote completo ${lot.lotCode}`,
              lotId: lot.id,
            });
          } else {
            // Traslado parcial: consumir del lote origen y crear nuevo lote en destino
            const consumeResult = await lotService.consumeLotsFromWarehouse(
              transfer.originWarehouseId,
              detail.productId,
              toTransfer,
              "TRANSFER",
              "transfers_detail",
              detail.id,
              tx
            );

            // Crear nuevo lote en destino con el mismo costo
            for (const consumption of consumeResult.consumptions) {
              const [originalLot] = await tx
                .select()
                .from(inventoryLots)
                .where(eq(inventoryLots.id, consumption.lotId));

              const newLotId = await lotService.createLot({
                productId: detail.productId,
                warehouseId: transfer.destinationWarehouseId,
                quantity: consumption.quantity,
                originalCurrencyId: originalLot.originalCurrencyId,
                originalUnitCost: parseFloat(originalLot.originalUnitCost),
                exchangeRate: parseFloat(originalLot.exchangeRate),
                sourceType: "TRANSFER",
                sourceId: id,
                sourceLotId: consumption.lotId,
                entryDate: getTodayDateString(),
              }, undefined, tx);

              await tx.insert(inventoryMovements).values({
                type: "TRANSFER_EXIT",
                status: "APPROVED",
                warehouseId: transfer.originWarehouseId,
                productId: detail.productId,
                quantity: consumption.quantity.toString(),
                reference: transferRef,
                reason: `Salida parcial de lote ${consumption.lotCode}`,
                lotId: consumption.lotId,
              });

              await tx.insert(inventoryMovements).values({
                type: "TRANSFER_ENTRY",
                status: "APPROVED",
                warehouseId: transfer.destinationWarehouseId,
                productId: detail.productId,
                quantity: consumption.quantity.toString(),
                reference: transferRef,
                reason: `Entrada desde lote ${consumption.lotCode}`,
                lotId: newLotId,
              });
            }
          }

          remainingQuantity -= toTransfer;
        }
      }

      return id;
    }).then(async (transferId) => {
      const completeTransfer = await this.getTransferById(transferId);
      return {
        message: "Traslado aceptado exitosamente. Lotes transferidos.",
        data: completeTransfer
      };
    });
  }

  // ========== RECHAZAR TRASLADO ==========
  async rejectTransfer(id: number, rejectionReason: string, userId: number) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== "PENDING") {
      throw new ValidationError("Solo se pueden rechazar traslados en estado PENDING");
    }

    // Validar que el usuario pertenece al almacén DESTINO
    await this.validateUserBelongsToWarehouse(userId, transfer.destinationWarehouseId);

    await db
      .update(transfers)
      .set({
        status: "REJECTED",
        rejectionReason,
        rejectedBy: userId,
        rejectedAt: new Date(),
      })
      .where(eq(transfers.id, id));

    const completeTransfer = await this.getTransferById(id);
    return {
      message: "Traslado rechazado exitosamente",
      data: completeTransfer
    };
  }

  // ========== CANCELAR TRASLADO APROBADO ==========
  async cancelTransfer(id: number, cancellationReason: string, userId: number) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== "APPROVED") {
      throw new ValidationError("Solo se pueden anular traslados en estado APPROVED");
    }

    // Validar que el usuario pertenece al almacén DESTINO (el que recibió puede cancelar)
    // O al almacén ORIGEN (el que envió puede cancelar)
    const userWarehouseIds = await this.getUserWarehouseIds(userId);
    if (!userWarehouseIds.includes(transfer.originWarehouseId) && 
        !userWarehouseIds.includes(transfer.destinationWarehouseId)) {
      throw new ForbiddenError("No tienes permiso para anular este traslado");
    }

    // Verificar que los lotes creados en destino NO hayan sido consumidos
    // Buscar lotes que se crearon por este traslado
    const lotsInDestination = await db
      .select({
        id: inventoryLots.id,
        lotCode: inventoryLots.lotCode,
        productId: inventoryLots.productId,
        currentQuantity: inventoryLots.currentQuantity,
        initialQuantity: inventoryLots.initialQuantity,
      })
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.sourceType, "TRANSFER"),
          eq(inventoryLots.sourceId, id),
          eq(inventoryLots.warehouseId, transfer.destinationWarehouseId)
        )
      );

    // Verificar si algún lote tiene consumos
    for (const lot of lotsInDestination) {
      const originalQty = parseFloat(lot.initialQuantity);
      const currentQty = parseFloat(lot.currentQuantity);
      
      if (currentQty < originalQty) {
        // El lote tiene consumos
        const consumed = originalQty - currentQty;
        const [product] = await db.select().from(products).where(eq(products.id, lot.productId));
        throw new ValidationError(
          `No se puede anular el traslado: el producto "${product.name}" (lote ${lot.lotCode}) ` +
          `tiene ${consumed.toFixed(2)} unidades consumidas en el almacén destino. ` +
          `Esto rompería la contabilidad del inventario.`
        );
      }
    }

    // También verificar si se movieron lotes completos y esos fueron consumidos
    // Buscar movimientos de entrada por traslado completo
    const transferEntryMovements = await db
      .select({
        lotId: inventoryMovements.lotId,
      })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.type, "TRANSFER_ENTRY"),
          eq(inventoryMovements.reference, transfer.transferNumber),
          sql`${inventoryMovements.reason} LIKE '%lote completo%'`
        )
      );

    for (const movement of transferEntryMovements) {
      if (movement.lotId) {
        const [lot] = await db
          .select()
          .from(inventoryLots)
          .where(eq(inventoryLots.id, movement.lotId));
        
        if (lot) {
          const originalQty = parseFloat(lot.initialQuantity);
          const currentQty = parseFloat(lot.currentQuantity);
          
          if (currentQty < originalQty) {
            const consumed = originalQty - currentQty;
            const [product] = await db.select().from(products).where(eq(products.id, lot.productId));
            throw new ValidationError(
              `No se puede anular el traslado: el producto "${product.name}" (lote ${lot.lotCode}) ` +
              `tiene ${consumed.toFixed(2)} unidades consumidas. ` +
              `Esto rompería la contabilidad del inventario.`
            );
          }
        }
      }
    }

    // Si llegamos aquí, podemos anular el traslado
    return await db.transaction(async (tx) => {
      // Actualizar estado del traslado
      await tx
        .update(transfers)
        .set({
          status: "CANCELLED",
          cancellationReason,
          cancelledBy: userId,
          cancelledAt: new Date(),
        })
        .where(eq(transfers.id, id));

      // Revertir los lotes creados (eliminarlos del destino)
      for (const lot of lotsInDestination) {
        const lotQuantity = parseFloat(lot.currentQuantity);
        
        await tx
          .update(inventoryLots)
          .set({ status: "EXHAUSTED", currentQuantity: "0" })
          .where(eq(inventoryLots.id, lot.id));
        
        // ✅ CORRECCIÓN: Actualizar caché del destino (restar)
        await lotService.updateInventoryCache(
          transfer.destinationWarehouseId,
          lot.productId,
          -lotQuantity,
          tx
        );
      }

      // Para los lotes que se movieron completos, moverlos de vuelta al origen
      for (const movement of transferEntryMovements) {
        if (movement.lotId) {
          const [lot] = await tx
            .select()
            .from(inventoryLots)
            .where(eq(inventoryLots.id, movement.lotId));
          
          if (lot && lot.sourceType === "PURCHASE") {
            const lotQuantity = parseFloat(lot.currentQuantity);
            
            // Este lote se movió completo, regresarlo
            await tx
              .update(inventoryLots)
              .set({ warehouseId: transfer.originWarehouseId })
              .where(eq(inventoryLots.id, movement.lotId));
            
            // ✅ CORRECCIÓN: Actualizar caché (restar del destino, sumar al origen)
            await lotService.updateInventoryCache(
              transfer.destinationWarehouseId,
              lot.productId,
              -lotQuantity,
              tx
            );
            await lotService.updateInventoryCache(
              transfer.originWarehouseId,
              lot.productId,
              lotQuantity,
              tx
            );
          }
        }
      }

      // Revertir consumos de lotes parciales en el origen
      const transferDetails = await tx
        .select({ 
          id: transfersDetail.id,
          productId: transfersDetail.productId,
        })
        .from(transfersDetail)
        .where(eq(transfersDetail.transferId, id));

      for (const detail of transferDetails) {
        // Buscar consumos asociados a este detalle
        const consumptions = await tx
          .select()
          .from(lotConsumptions)
          .where(
            and(
              eq(lotConsumptions.referenceType, "transfers_detail"),
              eq(lotConsumptions.referenceId, detail.id)
            )
          );

        for (const consumption of consumptions) {
          const consumedQty = parseFloat(consumption.quantity);
          
          // Revertir la cantidad al lote original
          await tx
            .update(inventoryLots)
            .set({
              currentQuantity: sql`${inventoryLots.currentQuantity} + ${consumption.quantity}`,
              status: "ACTIVE",
            })
            .where(eq(inventoryLots.id, consumption.lotId));
          
          // ✅ CORRECCIÓN: Actualizar caché del origen (sumar de vuelta)
          await lotService.updateInventoryCache(
            transfer.originWarehouseId,
            detail.productId,
            consumedQty,
            tx
          );
        }

        // Eliminar los registros de consumo
        await tx
          .delete(lotConsumptions)
          .where(
            and(
              eq(lotConsumptions.referenceType, "transfers_detail"),
              eq(lotConsumptions.referenceId, detail.id)
            )
          );
      }

      // Registrar movimientos de reversión
      const cancelRef = `${transfer.transferNumber}-ANULADO`;
      
      for (const detail of transfer.details) {
        await tx.insert(inventoryMovements).values({
          type: "TRANSFER_ENTRY",
          status: "APPROVED",
          warehouseId: transfer.originWarehouseId,
          productId: detail.productId,
          quantity: detail.quantity,
          reference: cancelRef,
          reason: `Reversión por anulación de traslado`,
        });

        await tx.insert(inventoryMovements).values({
          type: "TRANSFER_EXIT",
          status: "APPROVED",
          warehouseId: transfer.destinationWarehouseId,
          productId: detail.productId,
          quantity: detail.quantity,
          reference: cancelRef,
          reason: `Reversión por anulación de traslado`,
        });
      }

      return id;
    }).then(async (transferId) => {
      const completeTransfer = await this.getTransferById(transferId);
      return {
        message: "Traslado anulado exitosamente. Los lotes han sido revertidos al almacén origen.",
        data: completeTransfer
      };
    });
  }

  // ========== REPORTE DE TRASLADOS RECHAZADOS ==========
  async getRejectedTransfersReport(startDate: string, endDate: string) {
    const originWarehouse = aliasedTable(warehouses, "origin_warehouse");
    const destWarehouse = aliasedTable(warehouses, "dest_warehouse");

    const rejectedTransfers = await db
      .select({
        id: transfers.id,
        transferNumber: transfers.transferNumber,
        date: transfers.date,
        originWarehouseId: transfers.originWarehouseId,
        originWarehouseName: originWarehouse.name,
        destinationWarehouseId: transfers.destinationWarehouseId,
        destinationWarehouseName: destWarehouse.name,
        notes: transfers.notes,
        rejectionReason: transfers.rejectionReason,
        createdBy: transfers.createdBy,
        createdByName: createdByUser.nombre,
        rejectedBy: transfers.rejectedBy,
        rejectedByName: rejectedByUser.nombre,
        createdAt: transfers.createdAt,
        rejectedAt: transfers.rejectedAt,
      })
      .from(transfers)
      .innerJoin(originWarehouse, eq(transfers.originWarehouseId, originWarehouse.id))
      .innerJoin(destWarehouse, eq(transfers.destinationWarehouseId, destWarehouse.id))
      .leftJoin(createdByUser, eq(transfers.createdBy, createdByUser.id))
      .leftJoin(rejectedByUser, eq(transfers.rejectedBy, rejectedByUser.id))
      .where(
        and(
          eq(transfers.status, "REJECTED"),
          gte(transfers.rejectedAt, sql`${startDate}`),
          lte(transfers.rejectedAt, sql`${endDate}`)
        )
      )
      .orderBy(desc(transfers.rejectedAt));

    return {
      data: rejectedTransfers,
      summary: { totalRejected: rejectedTransfers.length }
    };
  }

  // ========== REPORTE DE TRASLADOS CANCELADOS ==========
  async getCancelledTransfersReport(startDate: string, endDate: string) {
    const originWarehouse = aliasedTable(warehouses, "origin_warehouse");
    const destWarehouse = aliasedTable(warehouses, "dest_warehouse");

    const cancelledTransfers = await db
      .select({
        id: transfers.id,
        transferNumber: transfers.transferNumber,
        date: transfers.date,
        originWarehouseId: transfers.originWarehouseId,
        originWarehouseName: originWarehouse.name,
        destinationWarehouseId: transfers.destinationWarehouseId,
        destinationWarehouseName: destWarehouse.name,
        notes: transfers.notes,
        cancellationReason: transfers.cancellationReason,
        createdBy: transfers.createdBy,
        createdByName: createdByUser.nombre,
        approvedBy: transfers.approvedBy,
        approvedByName: approvedByUser.nombre,
        approvedAt: transfers.approvedAt,
        cancelledBy: transfers.cancelledBy,
        cancelledByName: cancelledByUser.nombre,
        cancelledAt: transfers.cancelledAt,
      })
      .from(transfers)
      .innerJoin(originWarehouse, eq(transfers.originWarehouseId, originWarehouse.id))
      .innerJoin(destWarehouse, eq(transfers.destinationWarehouseId, destWarehouse.id))
      .leftJoin(createdByUser, eq(transfers.createdBy, createdByUser.id))
      .leftJoin(approvedByUser, eq(transfers.approvedBy, approvedByUser.id))
      .leftJoin(cancelledByUser, eq(transfers.cancelledBy, cancelledByUser.id))
      .where(
        and(
          eq(transfers.status, "CANCELLED"),
          gte(transfers.cancelledAt, sql`${startDate}`),
          lte(transfers.cancelledAt, sql`${endDate}`)
        )
      )
      .orderBy(desc(transfers.cancelledAt));

    return {
      data: cancelledTransfers,
      summary: { totalCancelled: cancelledTransfers.length }
    };
  }
}
