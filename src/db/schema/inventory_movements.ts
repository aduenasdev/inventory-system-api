import { mysqlTable, serial, int, decimal, varchar, text, timestamp, mysqlEnum } from "drizzle-orm/mysql-core";
import { warehouses } from "./warehouses";
import { products } from "./products";

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: serial("id").primaryKey(),
  type: mysqlEnum("type", [
    "INVOICE_ENTRY",
    "SALE_EXIT",
    "TRANSFER_ENTRY",
    "TRANSFER_EXIT",
    "ADJUSTMENT_ENTRY",
    "ADJUSTMENT_EXIT"
  ]).notNull(),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "CANCELLED"]).notNull().default("PENDING"),
  warehouseId: int("warehouse_id").notNull().references(() => warehouses.id),
  productId: int("product_id").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 18, scale: 2 }).notNull(),
  reference: varchar("reference", { length: 255 }), // ID de factura, traslado, ajuste
  reason: text("reason"), // Motivo para ajustes o cancelaciones
  lotId: int("lot_id"), // Referencia al lote (FK se maneja en migrate.ts)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
