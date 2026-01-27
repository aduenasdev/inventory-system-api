import {
  mysqlTable,
  serial,
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  date,
  index,
} from "drizzle-orm/mysql-core";
import { adjustmentTypes } from "./adjustment_types";
import { warehouses } from "./warehouses";
import { users } from "./users";

export const adjustments = mysqlTable(
  "adjustments",
  {
    id: serial("id").primaryKey(),
    adjustmentNumber: varchar("adjustment_number", { length: 20 }).notNull().unique(),
    
    adjustmentTypeId: int("adjustment_type_id")
      .notNull()
      .references(() => adjustmentTypes.id),
    
    warehouseId: int("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    
    date: date("date").notNull(),
    
    status: mysqlEnum("status", ["PENDING", "APPROVED", "CANCELLED"])
      .notNull()
      .default("PENDING"),
    
    reason: text("reason"),
    cancellationReason: text("cancellation_reason"),
    
    // Auditoría
    createdBy: int("created_by")
      .notNull()
      .references(() => users.id),
    acceptedBy: int("accepted_by").references(() => users.id),
    cancelledBy: int("cancelled_by").references(() => users.id),
    
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
    acceptedAt: timestamp("accepted_at"),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => ({
    idxAdjustmentWarehouse: index("idx_adjustment_warehouse").on(table.warehouseId),
    idxAdjustmentType: index("idx_adjustment_type").on(table.adjustmentTypeId),
    idxAdjustmentStatus: index("idx_adjustment_status").on(table.status),
    idxAdjustmentDate: index("idx_adjustment_date").on(table.date),
  })
);
