import {
  mysqlTable,
  serial,
  int,
  varchar,
  text,
  decimal,
  timestamp,
  mysqlEnum,
  date,
  index,
} from "drizzle-orm/mysql-core";
import { expenseTypes } from "./expense_types";
import { warehouses } from "./warehouses";
import { currencies } from "./currencies";
import { users } from "./users";

export const expenses = mysqlTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    expenseNumber: varchar("expense_number", { length: 20 }).notNull().unique(),
    
    expenseTypeId: int("expense_type_id")
      .notNull()
      .references(() => expenseTypes.id),
    
    // Establecimiento opcional - null para gastos corporativos/generales
    warehouseId: int("warehouse_id")
      .references(() => warehouses.id),
    
    date: date("date").notNull(),
    
    // Monto en moneda original
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    currencyId: int("currency_id")
      .notNull()
      .references(() => currencies.id),
    
    // Conversión a moneda base (CUP)
    exchangeRate: decimal("exchange_rate", { precision: 18, scale: 2 }),
    amountBase: decimal("amount_base", { precision: 18, scale: 2 }), // Monto en CUP
    
    description: text("description"),
    
    status: mysqlEnum("status", ["PENDING", "APPROVED", "CANCELLED"])
      .notNull()
      .default("PENDING"),
    
    cancellationReason: text("cancellation_reason"),
    
    // Auditoría
    createdBy: int("created_by")
      .notNull()
      .references(() => users.id),
    acceptedBy: int("accepted_by").references(() => users.id),
    cancelledBy: int("cancelled_by").references(() => users.id),
    
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
    acceptedAt: timestamp("accepted_at"),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => ({
    idxExpenseWarehouse: index("idx_expense_warehouse").on(table.warehouseId),
    idxExpenseType: index("idx_expense_type").on(table.expenseTypeId),
    idxExpenseStatus: index("idx_expense_status").on(table.status),
    idxExpenseDate: index("idx_expense_date").on(table.date),
  })
);
