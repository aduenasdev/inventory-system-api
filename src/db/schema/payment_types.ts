import { mysqlTable, serial, varchar, text, boolean, timestamp } from "drizzle-orm/mysql-core";

export const paymentTypes = mysqlTable("payment_types", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 100 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
});
