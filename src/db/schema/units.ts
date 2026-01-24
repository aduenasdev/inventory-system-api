import { mysqlTable, serial, varchar, text, boolean, timestamp, mysqlEnum } from "drizzle-orm/mysql-core";

// Tipos válidos de unidades de medida
export const UNIT_TYPES = ['weight', 'volume', 'length', 'countable', 'package'] as const;
export type UnitType = typeof UNIT_TYPES[number];

export const units = mysqlTable("units", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  shortName: varchar("short_name", { length: 20 }).notNull().unique(),
  description: text("description"),
  type: mysqlEnum("type", UNIT_TYPES).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
