import { db } from "../../db/connection";
import { transfers } from "../../db/schema/transfers";
import { transfersDetail } from "../../db/schema/transfers_detail";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventoryLots } from "../../db/schema/inventory_lots";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { users } from "../../db/schema/users";
import { eq, and, or, desc, sql, gte, lte, gt, asc } from "drizzle-orm";
import { normalizeBusinessDate, getTodayDateString } from "../../utils/date";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { lotService } from "../inventory/lots.service";

export class TransfersService {
  // Verificar stock disponible en origen (desde lotes)
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

  // Crear traslado
  async createTransfer(data: {
    date: string;
    originWarehouseId: number;
    destinationWarehouseId: number;
    notes?: string;
    details: Array<{
      productId: number;
      quantity: number;
    }>;
    userId: number;
  }) {
    if (data.originWarehouseId === data.destinationWarehouseId) {
      throw new ValidationError("El almacén de origen y destino no pueden ser el mismo");
    }

    // Validar stock para todos los productos
    for (const detail of data.details) {
      await this.checkStock(data.originWarehouseId, detail.productId, detail.quantity);
    }

    // Crear traslado
    const [transfer] = (await db.insert(transfers).values({
      date: new Date(normalizeBusinessDate(data.date)),
      originWarehouseId: data.originWarehouseId,
      destinationWarehouseId: data.destinationWarehouseId,
      status: "PENDING",
      notes: data.notes || null,
      createdBy: data.userId,
    })) as any;

    const transferId = transfer.insertId;

    // Insertar detalles
    await db.insert(transfersDetail).values(
      data.details.map((detail) => ({
        transferId,
        productId: detail.productId,
        quantity: detail.quantity.toString(),
      }))
    );

    return { id: transferId, message: "Traslado creado exitosamente" };
  }

  // Obtener todos los traslados
  async getAllTransfers() {
    return await db
      .select({
        id: transfers.id,
        date: transfers.date,
        originWarehouseId: transfers.originWarehouseId,
        originWarehouseName: warehouses.name,
        destinationWarehouseId: transfers.destinationWarehouseId,
        status: transfers.status,
        notes: transfers.notes,
        createdAt: transfers.createdAt,
      })
      .from(transfers)
      .innerJoin(warehouses, eq(transfers.originWarehouseId, warehouses.id))
      .orderBy(desc(transfers.createdAt));
  }

  // Obtener traslado por ID con detalles
  async getTransferById(id: number) {
    const [transfer] = await db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id));

    if (!transfer) {
      throw new NotFoundError("Traslado no encontrado");
    }

    const details = await db
      .select({
        id: transfersDetail.id,
        productId: transfersDetail.productId,
        productName: products.name,
        quantity: transfersDetail.quantity,
      })
      .from(transfersDetail)
      .innerJoin(products, eq(transfersDetail.productId, products.id))
      .where(eq(transfersDetail.transferId, id));

    return { ...transfer, details };
  }

  // Obtener traslados por almacén
  async getTransfersByWarehouse(warehouseId: number) {
    return await db
      .select()
      .from(transfers)
      .where(
        or(
          eq(transfers.originWarehouseId, warehouseId),
          eq(transfers.destinationWarehouseId, warehouseId)
        )
      )
      .orderBy(desc(transfers.createdAt));
  }

  // Aceptar traslado (consume lotes FIFO del origen y crea lotes en destino)
  async acceptTransfer(id: number, userId: number) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== "PENDING") {
      throw new ValidationError("Solo se pueden aceptar traslados en estado PENDING");
    }

    // Revalidar stock al momento de aceptar
    for (const detail of transfer.details) {
      await this.checkStock(
        transfer.originWarehouseId,
        detail.productId,
        parseFloat(detail.quantity)
      );
    }

    // Actualizar estado de traslado
    await db
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
      const transferRef = `TRASLADO-${id}`;

      // Obtener lotes FIFO del origen
      const originLots = await db
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
          await lotService.moveLotToWarehouse(lot.id, transfer.destinationWarehouseId);

          // Registrar consumo para trazabilidad
          await db.insert(inventoryMovements).values({
            type: "TRANSFER_EXIT",
            status: "APPROVED",
            warehouseId: transfer.originWarehouseId,
            productId: detail.productId,
            quantity: lot.currentQuantity,
            reference: transferRef,
            reason: `Traslado completo de lote ${lot.lotCode}`,
            lotId: lot.id,
          });

          await db.insert(inventoryMovements).values({
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
          
          // Registrar consumo del lote origen
          const consumeResult = await lotService.consumeLotsFromWarehouse(
            transfer.originWarehouseId,
            detail.productId,
            toTransfer,
            "TRANSFER",
            "transfers_detail",
            detail.id
          );

          // Crear nuevo lote en destino con el mismo costo del lote consumido
          // (puede venir de múltiples lotes, así que creamos uno por cada consumo)
          for (const consumption of consumeResult.consumptions) {
            // Obtener info completa del lote original
            const [originalLot] = await db
              .select()
              .from(inventoryLots)
              .where(eq(inventoryLots.id, consumption.lotId));

            // Crear lote en destino
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
            });

            await db.insert(inventoryMovements).values({
              type: "TRANSFER_EXIT",
              status: "APPROVED",
              warehouseId: transfer.originWarehouseId,
              productId: detail.productId,
              quantity: consumption.quantity.toString(),
              reference: transferRef,
              reason: `Salida parcial de lote ${consumption.lotCode}`,
              lotId: consumption.lotId,
            });

            await db.insert(inventoryMovements).values({
              type: "TRANSFER_ENTRY",
              status: "APPROVED",
              warehouseId: transfer.destinationWarehouseId,
              productId: detail.productId,
              quantity: consumption.quantity.toString(),
              reference: transferRef,
              reason: `Entrada desde lote ${consumption.lotCode} (nuevo lote creado)`,
              lotId: newLotId,
            });
          }
        }

        remainingQuantity -= toTransfer;
      }
    }

    return { message: "Traslado aceptado exitosamente. Lotes transferidos." };
  }

  // Rechazar traslado
  async rejectTransfer(id: number, rejectionReason: string, userId: number) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== "PENDING") {
      throw new ValidationError("Solo se pueden rechazar traslados en estado PENDING");
    }

    await db
      .update(transfers)
      .set({
        status: "REJECTED",
        rejectionReason,
        rejectedBy: userId,
        rejectedAt: new Date(),
      })
      .where(eq(transfers.id, id));

    return { message: "Traslado rechazado exitosamente" };
  }

  // Reporte de traslados rechazados
  async getRejectedTransfersReport(startDate?: string, endDate?: string) {
    const conditions: any[] = [eq(transfers.status, "REJECTED")];

    if (startDate) {
      conditions.push(gte(transfers.rejectedAt, sql`${startDate}`));
    }

    if (endDate) {
      conditions.push(lte(transfers.rejectedAt, sql`${endDate}`));
    }

    const rejectedTransfers = await db
      .select({
        id: transfers.id,
        date: transfers.date,
        originWarehouseId: transfers.originWarehouseId,
        destinationWarehouseId: transfers.destinationWarehouseId,
        status: transfers.status,
        notes: transfers.notes,
        rejectionReason: transfers.rejectionReason,
        createdBy: transfers.createdBy,
        rejectedBy: transfers.rejectedBy,
        rejectedByName: users.nombre,
        createdAt: transfers.createdAt,
        rejectedAt: transfers.rejectedAt,
      })
      .from(transfers)
      .leftJoin(users, eq(transfers.rejectedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(transfers.rejectedAt));

    // Obtener detalles de cada traslado
    const transfersWithDetails = await Promise.all(
      rejectedTransfers.map(async (transfer) => {
        const details = await db
          .select({
            id: transfersDetail.id,
            productId: transfersDetail.productId,
            productName: products.name,
            productCode: products.code,
            quantity: transfersDetail.quantity,
          })
          .from(transfersDetail)
          .innerJoin(products, eq(transfersDetail.productId, products.id))
          .where(eq(transfersDetail.transferId, transfer.id));

        return {
          ...transfer,
          details,
        };
      })
    );

    // Agrupar por razón de rechazo
    const byReason = new Map<string, { reason: string; count: number; transfers: any[] }>();

    for (const transfer of transfersWithDetails) {
      const reason = transfer.rejectionReason || "Sin razón especificada";
      if (!byReason.has(reason)) {
        byReason.set(reason, {
          reason,
          count: 0,
          transfers: [],
        });
      }
      const group = byReason.get(reason)!;
      group.count++;
      group.transfers.push(transfer);
    }

    return {
      summary: Array.from(byReason.values()).map((g) => ({
        reason: g.reason,
        count: g.count,
      })),
      details: transfersWithDetails,
    };
  }
}
