import { mysqlTable, serial, varchar, text, decimal, int, timestamp } from "drizzle-orm/mysql-core";

export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  description: text("description"),
  costPrice: decimal("cost_price", { precision: 18, scale: 2 }),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }),
  currencyId: int("currency_id").notNull(),
  unitId: int("unit_id").notNull(),
  categoryId: int("category_id").notNull().default(0),
  minStock: decimal("min_stock", { precision: 18, scale: 2 }).default("0"), // Stock mínimo para alertas
  reorderPoint: decimal("reorder_point", { precision: 18, scale: 2 }), // Punto de reorden (opcional)
  createdBy: int("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
