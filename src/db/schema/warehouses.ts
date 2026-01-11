import { mysqlTable, serial, varchar, text, boolean } from "drizzle-orm/mysql-core";

export const warehouses = mysqlTable("warehouses", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  provincia: varchar("provincia", { length: 100 }).notNull(),
  municipio: varchar("municipio", { length: 100 }).notNull(),
  direccion: text("direccion"),
  ubicacion: varchar("ubicacion", { length: 255 }), // coordenadas del mapa (lat,lng)
  active: boolean("active").notNull().default(false),
});
