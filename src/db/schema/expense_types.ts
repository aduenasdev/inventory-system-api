import { mysqlTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/mysql-core";

export const expenseTypes = mysqlTable("expense_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
