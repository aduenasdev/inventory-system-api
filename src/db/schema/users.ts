import { mysqlTable, serial, varchar, timestamp, boolean } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  apellido: varchar("apellido", { length: 100 }),
  telefono: varchar("telefono", { length: 20 }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
});
