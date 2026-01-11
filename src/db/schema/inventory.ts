import { mysqlTable, serial, int, decimal, timestamp } from "drizzle-orm/mysql-core";
import { warehouses } from "./warehouses";
import { products } from "./products";

export const inventory = mysqlTable("inventory", {
  id: serial("id").primaryKey(),
  warehouseId: int("warehouse_id").notNull().references(() => warehouses.id),
  productId: int("product_id").notNull().references(() => products.id),
  currentQuantity: decimal("current_quantity", { precision: 18, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
