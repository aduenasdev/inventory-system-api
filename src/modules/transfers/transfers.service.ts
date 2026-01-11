import { db } from "../../db/connection";
import { transfers } from "../../db/schema/transfers";
import { transfersDetail } from "../../db/schema/transfers_detail";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { inventory } from "../../db/schema/inventory";
import { products } from "../../db/schema/products";
import { warehouses } from "../../db/schema/warehouses";
import { users } from "../../db/schema/users";
import { eq, and, or, desc, sql, gte, lte } from "drizzle-orm";

export class TransfersService {
  // Verificar stock disponible en origen
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
      throw new Error(
        `Stock insuficiente para el producto "${product.name}". Disponible: ${currentQty}, Solicitado: ${quantity}`
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
      throw new Error("El almacén de origen y destino no pueden ser el mismo");
    }

    // Validar stock para todos los productos
    for (const detail of data.details) {
      await this.checkStock(data.originWarehouseId, detail.productId, detail.quantity);
    }

    // Crear traslado
    const [transfer] = (await db.insert(transfers).values({
      date: new Date(data.date),
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
      throw new Error("Traslado no encontrado");
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

  // Aceptar traslado
  async acceptTransfer(id: number, userId: number) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== "PENDING") {
      throw new Error("Solo se pueden aceptar traslados en estado PENDING");
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

    // Crear movimientos y actualizar inventario
    for (const detail of transfer.details) {
      const transferRef = `TRASLADO-${id}`;

      // Salida del almacén origen
      await db.insert(inventoryMovements).values({
        type: "TRANSFER_EXIT",
        status: "APPROVED",
        warehouseId: transfer.originWarehouseId,
        productId: detail.productId,
        quantity: detail.quantity,
        reference: transferRef,
        reason: `Salida por traslado ${transferRef}`,
      });

      await this.updateInventory(
        transfer.originWarehouseId,
        detail.productId,
        -parseFloat(detail.quantity)
      );

      // Entrada al almacén destino
      await db.insert(inventoryMovements).values({
        type: "TRANSFER_ENTRY",
        status: "APPROVED",
        warehouseId: transfer.destinationWarehouseId,
        productId: detail.productId,
        quantity: detail.quantity,
        reference: transferRef,
        reason: `Entrada por traslado ${transferRef}`,
      });

      await this.updateInventory(
        transfer.destinationWarehouseId,
        detail.productId,
        parseFloat(detail.quantity)
      );
    }

    return { message: "Traslado aceptado exitosamente" };
  }

  // Rechazar traslado
  async rejectTransfer(id: number, rejectionReason: string, userId: number) {
    const transfer = await this.getTransferById(id);

    if (transfer.status !== "PENDING") {
      throw new Error("Solo se pueden rechazar traslados en estado PENDING");
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
