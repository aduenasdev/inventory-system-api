import { mysqlTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/mysql-core";

export const adjustmentTypes = mysqlTable("adjustment_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  affectsPositively: boolean("affects_positively").notNull().default(false), // true = entrada, false = salida
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
