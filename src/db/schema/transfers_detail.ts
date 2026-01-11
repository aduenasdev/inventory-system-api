import { mysqlTable, serial, int, decimal } from "drizzle-orm/mysql-core";
import { transfers } from "./transfers";
import { products } from "./products";

export const transfersDetail = mysqlTable("transfers_detail", {
  id: serial("id").primaryKey(),
  transferId: int("transfer_id").notNull().references(() => transfers.id),
  productId: int("product_id").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 18, scale: 2 }).notNull(),
});
