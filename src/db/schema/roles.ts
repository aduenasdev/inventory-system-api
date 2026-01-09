import { mysqlTable, serial, varchar, text } from "drizzle-orm/mysql-core";

export const roles = mysqlTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  description: text("description"),
});
