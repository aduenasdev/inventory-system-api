import { mysqlTable, serial, varchar, text } from "drizzle-orm/mysql-core";

export const permissions = mysqlTable("permissions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  group: varchar("group_name", { length: 50 }).notNull(),
});
