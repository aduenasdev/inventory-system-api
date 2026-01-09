import { mysqlTable, int } from "drizzle-orm/mysql-core";
import { users } from "./users";
import { roles } from "./roles";

export const userRoles = mysqlTable("user_roles", {
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: int("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
});
