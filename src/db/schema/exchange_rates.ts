import { mysqlTable, serial, int, decimal, date, timestamp } from "drizzle-orm/mysql-core";

export const exchangeRates = mysqlTable("exchange_rates", {
  id: serial("id").primaryKey(),
  fromCurrencyId: int("from_currency_id").notNull(),
  toCurrencyId: int("to_currency_id").notNull(),
  rate: decimal("rate", { precision: 18, scale: 6 }).notNull(),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
