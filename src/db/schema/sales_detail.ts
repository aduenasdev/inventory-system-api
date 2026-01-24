import { mysqlTable, serial, int, decimal } from "drizzle-orm/mysql-core";
import { sales } from "./sales";
import { products } from "./products";
import { currencies } from "./currencies";
import { paymentTypes } from "./payment_types";

export const salesDetail = mysqlTable("sales_detail", {
  id: serial("id").primaryKey(),
  saleId: int("sale_id").notNull().references(() => sales.id),
  productId: int("product_id").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 18, scale: 4 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 18, scale: 4 }).notNull(),
  paymentTypeId: int("payment_type_id").notNull().references(() => paymentTypes.id),
  
  // Auditoría de conversión de moneda
  originalCurrencyId: int("original_currency_id").notNull().references(() => currencies.id),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 18, scale: 6 }),
  convertedUnitPrice: decimal("converted_unit_price", { precision: 18, scale: 4 }),
  
  subtotal: decimal("subtotal", { precision: 18, scale: 4 }).notNull(),

  // Costo real calculado desde lotes consumidos
  realCost: decimal("real_cost", { precision: 18, scale: 4 }),
  margin: decimal("margin", { precision: 18, scale: 4 }),
});
