import {
  mysqlTable,
  int,
  varchar,
  decimal,
  timestamp,
  mysqlEnum,
  index,
} from "drizzle-orm/mysql-core";
import { inventoryLots } from "./inventory_lots";

export const lotConsumptions = mysqlTable(
  "lot_consumptions",
  {
    id: int("id").autoincrement().primaryKey(),
    lotId: int("lot_id")
      .notNull()
      .references(() => inventoryLots.id),

    // Tipo de consumo
    consumptionType: mysqlEnum("consumption_type", [
      "SALE",
      "TRANSFER",
      "ADJUSTMENT",
      "CANCELLATION",
    ]).notNull(),

    // Referencia al documento que originó el consumo
    referenceType: varchar("reference_type", { length: 50 }).notNull(),
    referenceId: int("reference_id"), // Puede ser null para ajustes

    // Cantidad consumida de este lote
    quantity: decimal("quantity", { precision: 18, scale: 2 }).notNull(),

    // Costo unitario al momento del consumo (para trazabilidad)
    unitCostAtConsumption: decimal("unit_cost_at_consumption", {
      precision: 18,
      scale: 2,
    }).notNull(),
    totalCost: decimal("total_cost", { precision: 18, scale: 2 }).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxConsumptionLot: index("idx_consumption_lot").on(table.lotId),
    idxConsumptionReference: index("idx_consumption_reference").on(
      table.referenceType,
      table.referenceId
    ),
  })
);
