import { db } from "../../db/connection";
import { products } from "../../db/schema/products";
import { eq, count, sql, and, like as dLike } from "drizzle-orm";
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
import { inventoryLots } from "../../db/schema/inventory_lots";
import { promises as fs } from "fs";
import path from "path";
import { getTodayDateString } from "../../utils/date";

/**
 * Genera código de producto automático con formato YYYY-MM-DD-XXX
 * XXX es un contador diario que reinicia cada día
 */
async function generateProductCode(): Promise<string> {
  const datePrefix = getTodayDateString(); // YYYY-MM-DD
  
  // Buscar productos con código que empiece con la fecha de hoy
  const pattern = `${datePrefix}-%`;
  
  const existingCodes = await db
    .select({ code: products.code })
    .from(products)
    .where(dLike(products.code, pattern));

  // Extraer los números secuenciales
  let maxSequence = 0;
  for (const row of existingCodes) {
    const parts = row.code.split("-");
    if (parts.length === 4) {
      const seq = parseInt(parts[3], 10);
      if (!isNaN(seq) && seq > maxSequence) {
        maxSequence = seq;
      }
    }
  }

  // Incrementar y formatear con ceros a la izquierda (3 dígitos)
  const nextSequence = (maxSequence + 1).toString().padStart(3, "0");
  
  return `${datePrefix}-${nextSequence}`;
}

export async function createProduct(data: {
  name: string;
  code?: string; // Ahora es opcional
  description?: string;
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

  // Generar código automático si no se proporciona
  let productCode = data.code;
  if (!productCode) {
    productCode = await generateProductCode();
  } else {
    // Verificar si ya existe un producto con ese código
    const existingCode = await db.select().from(products).where(eq(products.code, productCode));
    if (existingCode.length > 0) {
      throw new ConflictError(`Ya existe un producto con el código "${productCode}"`);
    }
  }

  const [insert] = await db.insert(products).values({
    ...data,
    code: productCode,
    categoryId: data.categoryId ?? 0,
    salePrice: data.salePrice !== undefined ? data.salePrice.toString() : undefined,
  });
  return { id: insert.insertId, ...data, code: productCode };
}

/**
 * Obtiene productos paginados y filtrados por estado activo.
 * @param params { active?: boolean, page?: number, pageSize?: number, userPermissions?: string[] }
 */

export async function getAllProducts(params: {
  page?: number,
  pageSize?: number,
  name?: string,
  categoryId?: number,
  userPermissions?: string[]
}) {
  const { page = 1, pageSize = 20, name, categoryId, userPermissions = [] } = params;
  const canSeeCost = userPermissions.includes('products.cost.read');
  const log = logger;
  try {
    const whereClauses = [];
    if (name) {
      // Búsqueda LIKE por nombre o código (contiene)
      const { or } = require("drizzle-orm");
      whereClauses.push(or(
        dLike(products.name, `%${name}%`),
        dLike(products.code, `%${name}%`)
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

    // Solo calcular costos si el usuario tiene permiso
    let costMap = new Map<number, number>();
    
    if (canSeeCost) {
      // Calcular costo promedio ponderado de lotes activos para cada producto
      const productIds = items.map(p => p.id);
      
      // Obtener lotes activos agrupados por producto
      const lotsData = productIds.length > 0 
        ? await db
            .select({
              productId: inventoryLots.productId,
              totalQuantity: sql<string>`SUM(${inventoryLots.currentQuantity})`,
              totalCost: sql<string>`SUM(${inventoryLots.currentQuantity} * ${inventoryLots.unitCostBase})`,
            })
            .from(inventoryLots)
            .where(and(
              sql`${inventoryLots.productId} IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`,
              eq(inventoryLots.status, 'ACTIVE'),
              sql`${inventoryLots.currentQuantity} > 0`
            ))
            .groupBy(inventoryLots.productId)
        : [];

      // Crear mapa de costos calculados
      for (const lot of lotsData) {
        const totalQty = parseFloat(lot.totalQuantity || '0');
        const totalCost = parseFloat(lot.totalCost || '0');
        if (totalQty > 0) {
          costMap.set(lot.productId, totalCost / totalQty);
        }
      }

      // Para productos sin lotes activos, obtener el último costo conocido
      const productsWithoutCost = productIds.filter(id => !costMap.has(id));
      if (productsWithoutCost.length > 0) {
        const lastCosts = await db
          .select({
            productId: inventoryLots.productId,
            unitCostBase: inventoryLots.unitCostBase,
          })
          .from(inventoryLots)
          .where(sql`${inventoryLots.productId} IN (${sql.join(productsWithoutCost.map(id => sql`${id}`), sql`, `)})`)
          .orderBy(sql`${inventoryLots.entryDate} DESC, ${inventoryLots.id} DESC`);

        // Tomar solo el primer (más reciente) para cada producto
        for (const row of lastCosts) {
          if (!costMap.has(row.productId)) {
            costMap.set(row.productId, parseFloat(row.unitCostBase?.toString() || '0'));
          }
        }
      }
    }

    // Agregar URLs de imágenes y costo calculado
    const itemsWithUrls = await Promise.all(items.map(async (product) => {
      const thumbPath = path.join(__dirname, "..", "..", "..", "uploads", "products", `${product.id}_thumb.webp`);
      let hasThumb = false;
      try {
        await fs.access(thumbPath);
        hasThumb = true;
      } catch {
        hasThumb = false;
      }
      
      // Si tiene permiso: mostrar costo real, si no: mostrar 0
      const calculatedCost = canSeeCost ? (costMap.get(product.id) ?? null) : 0;
      const displayCostPrice = canSeeCost ? product.costPrice : "0";
      
      return {
        ...product,
        costPrice: displayCostPrice,
        calculatedCostPrice: calculatedCost,
        thumbUrl: hasThumb ? `/products/thumb/${product.id}.webp` : null,
        imageUrl: hasThumb ? `/products/image/${product.id}.webp` : null,
      };
    }));
    log.info({ total, page, pageSize, name, categoryId, canSeeCost }, "Consulta paginada de productos ejecutada");
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
    salePrice?: number;
    currencyId?: number;
    unitId?: number;
    categoryId?: number;
  }
) {
  // Verificar que el producto existe
  const existingProduct = await getProductById(productId);
  if (!existingProduct) {
    throw new NotFoundError("Producto no encontrado");
  }

  const updateData: any = {};

  // Validar nombre único
  if (data.name) {
    const existing = await db.select().from(products).where(eq(products.name, data.name));
    if (existing.length > 0 && existing[0].id !== productId) {
      throw new ConflictError(`El nombre "${data.name}" ya está en uso por otro producto`);
    }
    updateData.name = data.name;
  }

  // Validar código único
  if (data.code) {
    const existing = await db.select().from(products).where(eq(products.code, data.code));
    if (existing.length > 0 && existing[0].id !== productId) {
      throw new ConflictError(`El código "${data.code}" ya está en uso por otro producto`);
    }
    updateData.code = data.code;
  }

  // Validar que la moneda existe
  if (data.currencyId) {
    const [currency] = await db.select().from(currencies).where(eq(currencies.id, data.currencyId));
    if (!currency) {
      throw new NotFoundError(`La moneda con ID ${data.currencyId} no existe`);
    }
    updateData.currencyId = data.currencyId;
  }

  // Validar que la unidad existe
  if (data.unitId) {
    const [unit] = await db.select().from(units).where(eq(units.id, data.unitId));
    if (!unit) {
      throw new NotFoundError(`La unidad con ID ${data.unitId} no existe`);
    }
    updateData.unitId = data.unitId;
  }

  // Validar que la categoría existe (si no es 0)
  if (data.categoryId !== undefined) {
    if (data.categoryId !== 0) {
      const [category] = await db.select().from(categories).where(eq(categories.id, data.categoryId));
      if (!category) {
        throw new NotFoundError(`La categoría con ID ${data.categoryId} no existe`);
      }
    }
    updateData.categoryId = data.categoryId;
  }

  if (data.description !== undefined) updateData.description = data.description;
  if (data.salePrice !== undefined) updateData.salePrice = data.salePrice.toString();

  // Solo actualizar si hay cambios
  if (Object.keys(updateData).length === 0) {
    return existingProduct;
  }

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

  // Actualizar updatedAt para invalidar cache del frontend
  await db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, productId));

  return { message: "Imagen subida correctamente" };
}

// Eliminar imagen de producto
export async function deleteProductImage(productId: number) {
  const product = await getProductById(productId);
  if (!product) {
    throw new NotFoundError("Producto no encontrado");
  }

  await deleteProductImages(productId);

  // Actualizar updatedAt para invalidar cache del frontend
  await db.update(products).set({ updatedAt: new Date() }).where(eq(products.id, productId));

  return { message: "Imagen eliminada" };
}

// Eliminar producto
export async function deleteProduct(productId: number) {
  const product = await getProductById(productId);
  if (!product) {
    throw new NotFoundError("Producto no encontrado");
  }

  // Verificar si el producto tiene lotes de inventario
  const lotsWithProduct = await db.select().from(inventoryLots).where(eq(inventoryLots.productId, productId)).limit(1);
  if (lotsWithProduct.length > 0) {
    throw new ConflictError("No se puede eliminar el producto porque tiene lotes de inventario asociados");
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

  // Verificar si el producto está en inventario (caché)
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

