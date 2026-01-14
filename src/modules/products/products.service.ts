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
  imageBase64?: string;
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

  const { imageBase64, ...rest } = data;
  const [insert] = await db.insert(products).values({
    ...rest,
    costPrice: rest.costPrice !== undefined ? rest.costPrice.toString() : undefined,
    salePrice: rest.salePrice !== undefined ? rest.salePrice.toString() : undefined,
  });
  return { id: insert.insertId, ...rest };
}

/**
 * Obtiene productos paginados y filtrados por estado activo.
 * @param params { active?: boolean, page?: number, pageSize?: number }
 */

import { and, like } from "drizzle-orm";

export async function getAllProducts(params: {
  active?: boolean,
  page?: number,
  pageSize?: number,
  name?: string,
  categoryId?: number
}) {
  const { active, page = 1, pageSize = 20, name, categoryId } = params;
  const log = logger;
  try {
    const whereClauses = [];
    if (active !== undefined) {
      whereClauses.push(eq(products.isActive, active));
    }
    if (name) {
      // Búsqueda LIKE por nombre o código (contiene)
      const { or, like } = require("drizzle-orm");
      whereClauses.push(or(
        like(products.name, `%${name}%`),
        like(products.code, `%${name}%`)
      ));
    }
    if (categoryId !== undefined) {
      whereClauses.push(eq(products.categoryId, categoryId));
    }
    const where = whereClauses.length > 0 ? and(...whereClauses) : undefined;
    const offset = (page - 1) * pageSize;
    // Total
    const totalQuery = db.select().from(products);
    const total = where
      ? (await totalQuery.where(where)).length
      : (await totalQuery).length;
    // Items
    const itemsQuery = db.select().from(products);
    let items = where
      ? await itemsQuery.where(where).limit(pageSize).offset(offset)
      : await itemsQuery.limit(pageSize).offset(offset);

    // Agregar thumb (miniatura en base64) a cada producto y mantener imageUrl
    items = await Promise.all(items.map(async (product) => {
      const fs = require("fs");
      const path = require("path");
      const thumbPath = path.join(__dirname, "..", "..", "..", "uploads", "products", `product_${product.id}_thumb.webp`);
      let thumb = null;
      if (fs.existsSync(thumbPath)) {
        const buffer = fs.readFileSync(thumbPath);
        thumb = `data:image/webp;base64,${buffer.toString("base64")}`;
      }
      // Mantener imageUrl y retornar el producto + thumb
      return { ...product, thumb };
    }));
    log.info({ total, page, pageSize, active, name, categoryId }, "Consulta paginada de productos ejecutada");
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
    imageBase64?: string;
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
  const updatedProduct = await getProductById(productId);
  return updatedProduct;
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
  await deleteProductImages(productId);
  await processAndSaveImage(productId, imageBuffer);
  return { message: "Imagen subida correctamente" };
}

// Eliminar imagen de producto
export async function deleteProductImage(productId: number) {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("Producto no encontrado");
  }

  await deleteProductImages(productId);
  return { message: "Imagen eliminada" };
}
