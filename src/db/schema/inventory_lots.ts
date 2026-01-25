import {
  mysqlTable,
  int,
  varchar,
  decimal,
  timestamp,
  date,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { products } from "./products";
import { warehouses } from "./warehouses";
import { currencies } from "./currencies";

export const inventoryLots = mysqlTable(
  "inventory_lots",
  {
    id: int("id").autoincrement().primaryKey(),
    lotCode: varchar("lot_code", { length: 50 }).notNull().unique(),

    productId: int("product_id")
      .notNull()
      .references(() => products.id),
    warehouseId: int("warehouse_id")
      .notNull()
      .references(() => warehouses.id),

    // Cantidades
    initialQuantity: decimal("initial_quantity", { precision: 18, scale: 2 }).notNull(),
    currentQuantity: decimal("current_quantity", { precision: 18, scale: 2 }).notNull(),

    // Costos (siempre en moneda base CUP)
    unitCostBase: decimal("unit_cost_base", { precision: 18, scale: 2 }).notNull(),

    // Información original de la compra
    originalCurrencyId: int("original_currency_id")
      .notNull()
      .references(() => currencies.id),
    originalUnitCost: decimal("original_unit_cost", { precision: 18, scale: 2 }).notNull(),
    exchangeRate: decimal("exchange_rate", { precision: 18, scale: 2 }).notNull(),

    // Origen del lote
    sourceType: mysqlEnum("source_type", [
      "PURCHASE",
      "TRANSFER",
      "ADJUSTMENT",
      "MIGRATION",
    ]).notNull(),
    sourceId: int("source_id"),
    sourceLotId: int("source_lot_id"),

    // Fechas
    entryDate: date("entry_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),

    // Estado
    status: mysqlEnum("status", ["ACTIVE", "EXHAUSTED"]).notNull().default("ACTIVE"),
  },
  (table) => ({
    // Índice para consultas FIFO eficientes
    idxLotFifo: index("idx_lot_fifo").on(
      table.productId,
      table.warehouseId,
      table.status,
      table.entryDate,
      table.id
    ),
    idxLotWarehouse: index("idx_lot_warehouse").on(table.warehouseId),
    idxLotProduct: index("idx_lot_product").on(table.productId),
    idxLotSource: index("idx_lot_source").on(table.sourceType, table.sourceId),
  })
);
