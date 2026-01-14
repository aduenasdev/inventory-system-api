import { db } from "../../db/connection";
import { products } from "../../db/schema/products";
import { eq, count } from "drizzle-orm";
import { processAndSaveImage, deleteProductImages } from "../../utils/imageStorage";
import logger from "../../utils/logger";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import { currencies } from "../../db/schema/currencies";
import { units } from "../../db/schema/units";
import { categories } from "../../db/schema/categories";
import { salesDetail } from "../../db/schema/sales_detail";
import { purchasesDetail } from "../../db/schema/purchases_detail";
import { transfersDetail } from "../../db/schema/transfers_detail";
import { inventory } from "../../db/schema/inventory";
import { inventoryMovements } from "../../db/schema/inventory_movements";
import { promises as fs } from "fs";
import path from "path";

export async function createProduct(data: {
  name: string;
  code: string;
  description?: string;
  costPrice?: number;
  salePrice?: number;
  currencyId: number;
  unitId: number;
  categoryId?: number;
  createdBy: number;
}) {
  // Validar que currency existe
  const [currency] = await db.select().from(currencies).where(eq(currencies.id, data.currencyId));
  if (!currency) {
    throw new NotFoundError(`La moneda con ID ${data.currencyId} no existe`);
  }

  // Validar que unit existe
  const [unit] = await db.select().from(units).where(eq(units.id, data.unitId));
  if (!unit) {
    throw new NotFoundError(`La unidad con ID ${data.unitId} no existe`);
  }

  // Validar que category existe (si no es 0)
  if (data.categoryId && data.categoryId !== 0) {
    const [category] = await db.select().from(categories).where(eq(categories.id, data.categoryId));
    if (!category) {
      throw new NotFoundError(`La categoría con ID ${data.categoryId} no existe`);
    }
  }

  // Verificar si ya existe un producto con ese nombre
  const existingName = await db.select().from(products).where(eq(products.name, data.name));
  if (existingName.length > 0) {
    throw new ConflictError(`Ya existe un producto con el nombre "${data.name}"`);
  }

  // Verificar si ya existe un producto con ese código
  const existingCode = await db.select().from(products).where(eq(products.code, data.code));
  if (existingCode.length > 0) {
    throw new ConflictError(`Ya existe un producto con el código "${data.code}"`);
  }

  const [insert] = await db.insert(products).values({
    ...data,
    categoryId: data.categoryId ?? 0,
    costPrice: data.costPrice !== undefined ? data.costPrice.toString() : undefined,
    salePrice: data.salePrice !== undefined ? data.salePrice.toString() : undefined,
  });
  return { id: insert.insertId, ...data };
}

/**
 * Obtiene productos paginados y filtrados por estado activo.
 * @param params { active?: boolean, page?: number, pageSize?: number }
 */

import { and, like } from "drizzle-orm";

export async function getAllProducts(params: {
  page?: number,
  pageSize?: number,
  name?: string,
  categoryId?: number
}) {
  const { page = 1, pageSize = 20, name, categoryId } = params;
  const log = logger;
  try {
    const whereClauses = [];
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
    
    // Total usando COUNT(*) eficiente
    const [{ value: total }] = where
      ? await db.select({ value: count() }).from(products).where(where)
      : await db.select({ value: count() }).from(products);
    
    // Items
    const items = where
      ? await db.select().from(products).where(where).limit(pageSize).offset(offset)
      : await db.select().from(products).limit(pageSize).offset(offset);

    // Agregar URLs de imágenes en vez de base64 para mejor performance
    const itemsWithUrls = await Promise.all(items.map(async (product) => {
      const thumbPath = path.join(__dirname, "..", "..", "..", "uploads", "products", `product_${product.id}_thumb.webp`);
      let hasThumb = false;
      try {
        await fs.access(thumbPath);
        hasThumb = true;
      } catch {
        hasThumb = false;
      }
      
      return {
        ...product,
        thumbUrl: hasThumb ? `/api/products/thumb/${product.id}.webp` : null,
        imageUrl: hasThumb ? `/api/products/image/${product.id}.webp` : null,
      };
    }));
    log.info({ total, page, pageSize, name, categoryId }, "Consulta paginada de productos ejecutada");
    return {
      items: itemsWithUrls,
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
      throw new ConflictError(`El nombre "${data.name}" ya está en uso por otro producto`);
    }
    updateData.name = data.name;
  }

  if (data.code) {
    const existing = await db.select().from(products).where(eq(products.code, data.code));
    if (existing.length > 0 && existing[0].id !== productId) {
      throw new ConflictError(`El código "${data.code}" ya está en uso por otro producto`);
    }
    updateData.code = data.code;
  }

  if (data.description !== undefined) updateData.description = data.description;
  if (data.costPrice !== undefined) updateData.costPrice = data.costPrice.toString();
  if (data.salePrice !== undefined) updateData.salePrice = data.salePrice.toString();
  if (data.currencyId) updateData.currencyId = data.currencyId;
  if (data.unitId) updateData.unitId = data.unitId;
  if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;

  await db.update(products).set(updateData).where(eq(products.id, productId));
  const updatedProduct = await getProductById(productId);
  return updatedProduct;
}

// Subir imagen de producto
export async function uploadProductImage(productId: number, imageBuffer: Buffer) {
  // Verificar que el producto existe
  const product = await getProductById(productId);
  if (!product) {
    throw new NotFoundError("Producto no encontrado");
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
    throw new NotFoundError("Producto no encontrado");
  }

  await deleteProductImages(productId);
  return { message: "Imagen eliminada" };
}

// Eliminar producto
export async function deleteProduct(productId: number) {
  const product = await getProductById(productId);
  if (!product) {
    throw new NotFoundError("Producto no encontrado");
  }

  // Verificar si el producto está en ventas
  const salesWithProduct = await db.select().from(salesDetail).where(eq(salesDetail.productId, productId)).limit(1);
  if (salesWithProduct.length > 0) {
    throw new ConflictError("No se puede eliminar el producto porque está asociado a ventas");
  }

  // Verificar si el producto está en compras
  const purchasesWithProduct = await db.select().from(purchasesDetail).where(eq(purchasesDetail.productId, productId)).limit(1);
  if (purchasesWithProduct.length > 0) {
    throw new ConflictError("No se puede eliminar el producto porque está asociado a compras");
  }

  // Verificar si el producto está en traslados
  const transfersWithProduct = await db.select().from(transfersDetail).where(eq(transfersDetail.productId, productId)).limit(1);
  if (transfersWithProduct.length > 0) {
    throw new ConflictError("No se puede eliminar el producto porque está asociado a traslados");
  }

  // Verificar si el producto está en inventario
  const inventoryWithProduct = await db.select().from(inventory).where(eq(inventory.productId, productId)).limit(1);
  if (inventoryWithProduct.length > 0) {
    throw new ConflictError("No se puede eliminar el producto porque tiene registros en inventario");
  }

  // Verificar si el producto está en movimientos de inventario
  const movementsWithProduct = await db.select().from(inventoryMovements).where(eq(inventoryMovements.productId, productId)).limit(1);
  if (movementsWithProduct.length > 0) {
    throw new ConflictError("No se puede eliminar el producto porque tiene movimientos de inventario");
  }

  // Si pasa todas las validaciones, eliminar las imágenes y el producto
  await deleteProductImages(productId);
  await db.delete(products).where(eq(products.id, productId));
  
  return { message: "Producto eliminado exitosamente" };
}

