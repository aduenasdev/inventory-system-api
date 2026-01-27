import { mysqlTable, serial, int, decimal, index } from "drizzle-orm/mysql-core";
import { adjustments } from "./adjustments";
import { products } from "./products";
import { currencies } from "./currencies";

export const adjustmentsDetail = mysqlTable(
  "adjustments_detail",
  {
    id: serial("id").primaryKey(),
    adjustmentId: int("adjustment_id")
      .notNull()
      .references(() => adjustments.id),
    productId: int("product_id")
      .notNull()
      .references(() => products.id),
    quantity: decimal("quantity", { precision: 18, scale: 2 }).notNull(),
    
    // Solo para ajustes de ENTRADA (affectsPositively = true)
    currencyId: int("currency_id").references(() => currencies.id),
    unitCost: decimal("unit_cost", { precision: 18, scale: 2 }),
    exchangeRate: decimal("exchange_rate", { precision: 18, scale: 2 }),
    unitCostBase: decimal("unit_cost_base", { precision: 18, scale: 2 }), // Costo en CUP
    
    // Referencia al lote creado (para entradas) o consumido (para salidas)
    lotId: int("lot_id"),
  },
  (table) => ({
    idxAdjustmentDetailAdjustment: index("idx_adjustment_detail_adjustment").on(table.adjustmentId),
    idxAdjustmentDetailProduct: index("idx_adjustment_detail_product").on(table.productId),
  })
);
