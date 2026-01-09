import { mysqlTable, int } from "drizzle-orm/mysql-core";

export const rolePermissions = mysqlTable("role_permissions", {
  roleId: int("role_id").notNull(),
  permissionId: int("permission_id").notNull(),
});
