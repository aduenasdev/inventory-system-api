import { mysqlTable, serial, int, decimal } from "drizzle-orm/mysql-core";
import { sales } from "./sales";
import { products } from "./products";
import { currencies } from "./currencies";

export const salesDetail = mysqlTable("sales_detail", {
  id: serial("id").primaryKey(),
  saleId: int("sale_id").notNull().references(() => sales.id),
  productId: int("product_id").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 18, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 18, scale: 2 }).notNull(),
  
  // Auditoría de conversión de moneda
  originalCurrencyId: int("original_currency_id").notNull().references(() => currencies.id),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 18, scale: 2 }),
  convertedUnitPrice: decimal("converted_unit_price", { precision: 18, scale: 2 }),
  
  subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull(),

  // Costo real calculado desde lotes consumidos
  realCost: decimal("real_cost", { precision: 18, scale: 2 }),
  margin: decimal("margin", { precision: 18, scale: 2 }),
});
