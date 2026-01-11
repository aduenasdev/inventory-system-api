import { mysqlTable, serial, int, varchar, date, decimal, text, timestamp, mysqlEnum } from "drizzle-orm/mysql-core";
import { warehouses } from "./warehouses";
import { currencies } from "./currencies";
import { users } from "./users";

export const sales = mysqlTable("sales", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(), // FV-2026-00001
  customerName: varchar("customer_name", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 20 }),
  date: date("date").notNull(),
  warehouseId: int("warehouse_id").notNull().references(() => warehouses.id),
  currencyId: int("currency_id").notNull().references(() => currencies.id),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "CANCELLED"]).notNull().default("PENDING"),
  cancellationReason: text("cancellation_reason"),
  subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 18, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  
  // Auditoría
  createdBy: int("created_by").notNull().references(() => users.id),
  acceptedBy: int("accepted_by").references(() => users.id),
  cancelledBy: int("cancelled_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
  acceptedAt: timestamp("accepted_at"),
  cancelledAt: timestamp("cancelled_at"),
});
