import { mysqlTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/mysql-core";

export const units = mysqlTable("units", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  shortName: varchar("short_name", { length: 20 }).notNull().unique(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(), // weight, volume, length, count
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
