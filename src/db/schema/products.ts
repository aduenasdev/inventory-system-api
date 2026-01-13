import { mysqlTable, serial, varchar, text, decimal, int, boolean, timestamp } from "drizzle-orm/mysql-core";

export const products = mysqlTable("products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  description: text("description"),
  costPrice: decimal("cost_price", { precision: 18, scale: 2 }),
  salePrice: decimal("sale_price", { precision: 18, scale: 2 }),
  currencyId: int("currency_id").notNull(),
  unitId: int("unit_id").notNull(),
  categoryId: int("category_id").notNull(),
  imageUrl: varchar("image_url", { length: 500 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
