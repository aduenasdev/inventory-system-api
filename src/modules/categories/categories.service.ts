import { db } from "../../db/connection";
import { categories } from "../../db/schema/categories";
import { products } from "../../db/schema/products";
import { eq } from "drizzle-orm";
import { ConflictError, ValidationError } from "../../utils/errors";

export async function createCategory(data: {
  name: string;
  description?: string;
}) {
  // Verificar si ya existe una categoría con ese nombre
  const existing = await db.select().from(categories).where(eq(categories.name, data.name));
  if (existing.length > 0) {
    throw new ConflictError(`Ya existe una categoría con el nombre "${data.name}"`);
  }

  const [insert] = await db.insert(categories).values(data);
  return { id: insert.insertId, ...data };
}

export async function getAllCategories(activeFilter?: boolean) {
  if (activeFilter !== undefined) {
    return db.select().from(categories).where(eq(categories.isActive, activeFilter));
  }
  return db.select().from(categories);
}

export async function getCategoryById(categoryId: number) {
  const rows = await db.select().from(categories).where(eq(categories.id, categoryId));
  return rows[0] || null;
}

export async function updateCategory(
  categoryId: number,
  data: {
    name?: string;
    description?: string;
  }
) {
  const updateData: any = {};

  if (data.name) {
    const existing = await db.select().from(categories).where(eq(categories.name, data.name));
    if (existing.length > 0 && existing[0].id !== categoryId) {
      throw new ConflictError(`El nombre "${data.name}" ya está en uso por otra categoría`);
    }
    updateData.name = data.name;
  }

  if (data.description !== undefined) updateData.description = data.description;

  await db.update(categories).set(updateData).where(eq(categories.id, categoryId));
  
  // Retornar la categoría actualizada
  const [updated] = await db.select().from(categories).where(eq(categories.id, categoryId));
  return updated;
}

export async function disableCategory(categoryId: number) {
  // Verificar si la categoría tiene productos asociados
  const productsWithCategory = await db
    .select()
    .from(products)
    .where(eq(products.categoryId, categoryId))
    .limit(1);

  if (productsWithCategory.length > 0) {
    throw new ValidationError("No se puede deshabilitar la categoría porque tiene productos asociados");
  }

  await db.update(categories).set({ isActive: false }).where(eq(categories.id, categoryId));
  return { message: "Categoría deshabilitada" };
}

export async function enableCategory(categoryId: number) {
  await db.update(categories).set({ isActive: true }).where(eq(categories.id, categoryId));
  return { message: "Categoría habilitada" };
}

export async function deleteCategory(categoryId: number) {
  // Verificar si la categoría tiene productos asociados
  const productsWithCategory = await db
    .select()
    .from(products)
    .where(eq(products.categoryId, categoryId))
    .limit(1);

  if (productsWithCategory.length > 0) {
    throw new ValidationError("No se puede eliminar la categoría porque tiene productos asociados");
  }

  await db.delete(categories).where(eq(categories.id, categoryId));
  return { message: "Categoría eliminada exitosamente" };
}

