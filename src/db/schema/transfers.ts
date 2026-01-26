import { mysqlTable, serial, int, date, text, timestamp, mysqlEnum, varchar } from "drizzle-orm/mysql-core";
import { warehouses } from "./warehouses";
import { users } from "./users";

export const transfers = mysqlTable("transfers", {
  id: serial("id").primaryKey(),
  transferNumber: varchar("transfer_number", { length: 50 }).notNull().unique(),
  originWarehouseId: int("origin_warehouse_id").notNull().references(() => warehouses.id),
  destinationWarehouseId: int("destination_warehouse_id").notNull().references(() => warehouses.id),
  date: date("date").notNull(),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).notNull().default("PENDING"),
  rejectionReason: text("rejection_reason"),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),
  
  // Auditoría
  createdBy: int("created_by").notNull().references(() => users.id),
  approvedBy: int("approved_by").references(() => users.id),
  rejectedBy: int("rejected_by").references(() => users.id),
  cancelledBy: int("cancelled_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  cancelledAt: timestamp("cancelled_at"),
});
