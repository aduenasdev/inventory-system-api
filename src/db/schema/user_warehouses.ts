import { mysqlTable, int } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { warehouses } from "./warehouses";

export const userWarehouses = mysqlTable("user_warehouses", {
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  warehouseId: int("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
});
