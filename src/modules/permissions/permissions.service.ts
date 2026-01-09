import { db } from "../../db/connection";
import { permissions } from "../../db/schema/permissions";

export async function getAllPermissions() {
  const result = await db.select().from(permissions);
  return result;
}
