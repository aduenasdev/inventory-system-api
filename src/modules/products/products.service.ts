import { db } from "../../db/connection";
import { products } from "../../db/schema/products";
import { eq } from "drizzle-orm";
import { processAndSaveImage, deleteProductImages } from "../../utils/imageStorage";
import logger from "../../utils/logger";

export async function createProduct(data: {
  name: string;
  code: string;
  description?: string;
  costPrice?: number;
  salePrice?: number;
  currencyId: number;
  unitId: number;
  categoryId: number;
}) {
  // Verificar si ya existe un producto con ese nombre
  const existingName = await db.select().from(products).where(eq(products.name, data.name));
  if (existingName.length > 0) {
    throw new Error(`Ya existe un producto con el nombre "${data.name}"`);
  }

  // Verificar si ya existe un producto con ese código
  const existingCode = await db.select().from(products).where(eq(products.code, data.code));
  if (existingCode.length > 0) {
    throw new Error(`Ya existe un producto con el código "${data.code}"`);
  }

  const [insert] = await db.insert(products).values({
    ...data,
    costPrice: data.costPrice !== undefined ? data.costPrice.toString() : undefined,
    salePrice: data.salePrice !== undefined ? data.salePrice.toString() : undefined,
  });
  return { id: insert.insertId, ...data };
}

/**
 * Obtiene productos paginados y filtrados por estado activo.
 * @param params { active?: boolean, page?: number, pageSize?: number }
 */
export async function getAllProducts(params: { active?: boolean, page?: number, pageSize?: number }) {
  const { active, page = 1, pageSize = 20 } = params;
  const log = logger;
  try {
    const whereClause = active !== undefined ? eq(products.isActive, active) : undefined;
    const offset = (page - 1) * pageSize;
    // Total
    const totalQuery = db.select().from(products);
    const total = whereClause
      ? (await totalQuery.where(whereClause)).length
      : (await totalQuery).length;
    // Items
    const itemsQuery = db.select().from(products);
    const items = whereClause
      ? await itemsQuery.where(whereClause).limit(pageSize).offset(offset)
      : await itemsQuery.limit(pageSize).offset(offset);
    log.info({ total, page, pageSize, active }, "Consulta paginada de productos ejecutada");
    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    log.warn({ error, params }, "Error en consulta paginada de productos");
    throw error;
  }
}


export async function getProductById(productId: number) {
  const rows = await db.select().from(products).where(eq(products.id, productId));
  return rows[0] || null;
}

export async function getProductsByCategory(categoryId: number) {
  return db.select().from(products).where(eq(products.categoryId, categoryId));
}

export async function updateProduct(
  productId: number,
  data: {
    name?: string;
    code?: string;
    description?: string;
    costPrice?: number;
    salePrice?: number;
    currencyId?: number;
    unitId?: number;
    categoryId?: number;
  }
) {
  const updateData: any = {};

  if (data.name) {
    const existing = await db.select().from(products).where(eq(products.name, data.name));
    if (existing.length > 0 && existing[0].id !== productId) {
      throw new Error(`El nombre "${data.name}" ya está en uso por otro producto`);
    }
    updateData.name = data.name;
  }

  if (data.code) {
    const existing = await db.select().from(products).where(eq(products.code, data.code));
    if (existing.length > 0 && existing[0].id !== productId) {
      throw new Error(`El código "${data.code}" ya está en uso por otro producto`);
    }
    updateData.code = data.code;
  }

  if (data.description !== undefined) updateData.description = data.description;
  if (data.costPrice !== undefined) updateData.costPrice = data.costPrice.toString();
  if (data.salePrice !== undefined) updateData.salePrice = data.salePrice.toString();
  if (data.currencyId) updateData.currencyId = data.currencyId;
  if (data.unitId) updateData.unitId = data.unitId;
  if (data.categoryId) updateData.categoryId = data.categoryId;

  await db.update(products).set(updateData).where(eq(products.id, productId));
  return { message: "Producto actualizado" };
}

export async function disableProduct(productId: number) {
  await db.update(products).set({ isActive: false }).where(eq(products.id, productId));
  return { message: "Producto deshabilitado" };
}

export async function enableProduct(productId: number) {
  await db.update(products).set({ isActive: true }).where(eq(products.id, productId));
  return { message: "Producto habilitado" };
}

// Subir imagen de producto
export async function uploadProductImage(productId: number, imageBuffer: Buffer) {
  // Verificar que el producto existe
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Producto no encontrado");
  }

  // Si ya tenía imagen, eliminarla
  if (product.imageUrl) {
    await deleteProductImages(productId);
  }

  // Procesar y guardar nueva imagen
  const { imageUrl } = await processAndSaveImage(productId, imageBuffer);

  // Actualizar BD
  await db.update(products).set({ imageUrl }).where(eq(products.id, productId));

  return { imageUrl, message: "Imagen subida correctamente" };
}

// Eliminar imagen de producto
export async function deleteProductImage(productId: number) {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Producto no encontrado");
  }

  if (product.imageUrl) {
    await deleteProductImages(productId);
    await db.update(products).set({ imageUrl: null }).where(eq(products.id, productId));
  }

  return { message: "Imagen eliminada" };
}
