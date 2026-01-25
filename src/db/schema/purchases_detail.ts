import { mysqlTable, serial, int, decimal } from "drizzle-orm/mysql-core";
import { purchases } from "./purchases";
import { products } from "./products";
import { currencies } from "./currencies";

export const purchasesDetail = mysqlTable("purchases_detail", {
  id: serial("id").primaryKey(),
  purchaseId: int("purchase_id").notNull().references(() => purchases.id),
  productId: int("product_id").notNull().references(() => products.id),
  quantity: decimal("quantity", { precision: 18, scale: 2 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 18, scale: 2 }).notNull(),
  
  // Auditoría de conversión de moneda
  originalCurrencyId: int("original_currency_id").references(() => currencies.id),
  exchangeRateUsed: decimal("exchange_rate_used", { precision: 18, scale: 2 }),
  convertedUnitCost: decimal("converted_unit_cost", { precision: 18, scale: 2 }),
  
  subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull(),
  
  // Referencia al lote creado cuando la compra es aceptada
  lotId: int("lot_id"),
});
