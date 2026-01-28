import { mysqlTable, serial, int, varchar, date, decimal, text, timestamp, mysqlEnum, boolean } from "drizzle-orm/mysql-core";
import { warehouses } from "./warehouses";
import { currencies } from "./currencies";
import { users } from "./users";

export const purchases = mysqlTable("purchases", {
  id: serial("id").primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(), // FC-2026-00001
  supplierName: varchar("supplier_name", { length: 255 }),
  supplierPhone: varchar("supplier_phone", { length: 20 }),
  date: date("date").notNull(),
  warehouseId: int("warehouse_id").notNull().references(() => warehouses.id),
  currencyId: int("currency_id").notNull().references(() => currencies.id),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "CANCELLED"]).notNull().default("PENDING"),
  cancellationReason: text("cancellation_reason"),
  subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 18, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  
  // Indica si la compra tiene precios asignados (false = lotes bloqueados)
  hasPricing: boolean("has_pricing").notNull().default(true),
  
  // Auditoría
  createdBy: int("created_by").notNull().references(() => users.id),
  acceptedBy: int("accepted_by").references(() => users.id),
  cancelledBy: int("cancelled_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
  acceptedAt: timestamp("accepted_at"),
  cancelledAt: timestamp("cancelled_at"),
});
