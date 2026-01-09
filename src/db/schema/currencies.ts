import { mysqlTable, serial, varchar, int, boolean, timestamp } from "drizzle-orm/mysql-core";

export const currencies = mysqlTable("currencies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  decimalPlaces: int("decimal_places").notNull().default(2),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
