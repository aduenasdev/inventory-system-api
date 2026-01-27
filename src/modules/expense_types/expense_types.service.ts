import { db } from "../../db/connection";
import { expenseTypes } from "../../db/schema/expense_types";
import { eq } from "drizzle-orm";
import { ConflictError, ValidationError, NotFoundError } from "../../utils/errors";

export async function createExpenseType(data: {
  name: string;
  description?: string;
}) {
  // Verificar si ya existe un tipo de gasto con ese nombre
  const existing = await db.select().from(expenseTypes).where(eq(expenseTypes.name, data.name));
  if (existing.length > 0) {
    throw new ConflictError(`Ya existe un tipo de gasto con el nombre "${data.name}"`);
  }

  const [insert] = await db.insert(expenseTypes).values(data) as any;
  return { id: insert.insertId, ...data };
}

export async function getAllExpenseTypes(activeFilter?: boolean) {
  if (activeFilter !== undefined) {
    return db.select().from(expenseTypes).where(eq(expenseTypes.isActive, activeFilter));
  }
  return db.select().from(expenseTypes);
}

export async function getExpenseTypeById(expenseTypeId: number) {
  const rows = await db.select().from(expenseTypes).where(eq(expenseTypes.id, expenseTypeId));
  if (!rows[0]) {
    throw new NotFoundError("Tipo de gasto no encontrado");
  }
  return rows[0];
}

export async function updateExpenseType(
  expenseTypeId: number,
  data: {
    name?: string;
    description?: string;
  }
) {
  // Verificar que existe
  await getExpenseTypeById(expenseTypeId);

  const updateData: any = {};

  if (data.name) {
    const existing = await db.select().from(expenseTypes).where(eq(expenseTypes.name, data.name));
    if (existing.length > 0 && existing[0].id !== expenseTypeId) {
      throw new ConflictError(`El nombre "${data.name}" ya está en uso por otro tipo de gasto`);
    }
    updateData.name = data.name;
  }

  if (data.description !== undefined) updateData.description = data.description;

  await db.update(expenseTypes).set(updateData).where(eq(expenseTypes.id, expenseTypeId));
  
  // Retornar el tipo de gasto actualizado
  const [updated] = await db.select().from(expenseTypes).where(eq(expenseTypes.id, expenseTypeId));
  return updated;
}

export async function disableExpenseType(expenseTypeId: number) {
  // Verificar que existe
  await getExpenseTypeById(expenseTypeId);

  // TODO: Cuando exista el módulo de gastos, verificar si tiene gastos asociados
  // const expensesWithType = await db
  //   .select()
  //   .from(expenses)
  //   .where(eq(expenses.expenseTypeId, expenseTypeId))
  //   .limit(1);
  // if (expensesWithType.length > 0) {
  //   throw new ValidationError("No se puede deshabilitar el tipo de gasto porque tiene gastos asociados");
  // }

  await db.update(expenseTypes).set({ isActive: false }).where(eq(expenseTypes.id, expenseTypeId));
  return { message: "Tipo de gasto deshabilitado exitosamente" };
}

export async function enableExpenseType(expenseTypeId: number) {
  // Verificar que existe
  await getExpenseTypeById(expenseTypeId);

  await db.update(expenseTypes).set({ isActive: true }).where(eq(expenseTypes.id, expenseTypeId));
  return { message: "Tipo de gasto habilitado exitosamente" };
}

export async function deleteExpenseType(expenseTypeId: number) {
  // Verificar que existe
  await getExpenseTypeById(expenseTypeId);

  // TODO: Cuando exista el módulo de gastos, verificar si tiene gastos asociados
  // const expensesWithType = await db
  //   .select()
  //   .from(expenses)
  //   .where(eq(expenses.expenseTypeId, expenseTypeId))
  //   .limit(1);
  // if (expensesWithType.length > 0) {
  //   throw new ValidationError("No se puede eliminar el tipo de gasto porque tiene gastos asociados");
  // }

  await db.delete(expenseTypes).where(eq(expenseTypes.id, expenseTypeId));
  return { message: "Tipo de gasto eliminado exitosamente" };
}
