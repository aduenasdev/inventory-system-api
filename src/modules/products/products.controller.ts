import path from "path";
import fs from "fs";
// Retorna la imagen grande del producto
export async function getProductImageHandler(req: Request, res: Response) {
  // Permitir rutas tipo /products/image/:productId.webp
  let { productId } = req.params;
  // Si viene como /image/:productId.webp, productId ya está en params
  const imagePath = path.join(__dirname, "..", "..", "..", "uploads", "products", `product_${productId}.webp`);
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ message: "Imagen no encontrada" });
  }
}

// Retorna la miniatura del producto

import { Request, Response } from "express";
import logger from "../../utils/logger";
import {
  createProduct,
  getAllProducts,
  getProductById,
  getProductsByCategory,
  updateProduct,
  disableProduct,
  enableProduct,
  uploadProductImage,
  deleteProductImage,
} from "./products.service";

export async function createProductHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    log.info({ body: req.body }, "Intento de crear producto");
    const { imageBase64, ...productData } = req.body;
    let product = await createProduct(productData);
    // Si viene imagen en base64, procesar y guardar
    if (imageBase64) {
      let base64String = imageBase64;
      if (imageBase64.startsWith('data:')) {
        const parts = imageBase64.split(',');
        if (parts.length !== 2) {
          throw new Error('Formato base64 inválido');
        }
        base64String = parts[1];
      }
      // Validar base64
      try {
        const buffer = Buffer.from(base64String, 'base64');
        // Si el buffer es muy pequeño o no decodifica, error
        if (!buffer || buffer.length < 10) {
          throw new Error('Imagen base64 inválida o vacía');
        }
        await uploadProductImage(product.id, buffer);
      } catch (err) {
        log.warn({ error: err }, "Error al procesar imagen base64");
        throw new Error('La imagen enviada no es válida (base64)');
      }
    }
    log.info({ product }, "Producto creado exitosamente");
    res.status(201).json(product);
  } catch (error: any) {
    log.warn({ error, body: req.body }, "Error al crear producto");
    res.status(400).json({ message: error.message });
  }
}

export async function getProductsHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
    const name = req.query.name ? String(req.query.name) : undefined;
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string, 10) : undefined;
    log.info({ active, page, pageSize, name, categoryId }, "Consulta de productos paginada y filtrada");
    const result = await getAllProducts({ active, page, pageSize, name, categoryId });
    log.info({ total: result.total, page, pageSize, name, categoryId }, "Productos obtenidos");
    res.status(200).json(result);
  } catch (error: any) {
    log.warn({ error, query: req.query }, "Error al obtener productos");
    res.status(500).json({ message: "Error al obtener productos" });
  }
}

export async function getProductHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    const { productId } = req.params;
    log.info({ productId }, "Consulta de producto por ID");
    const product = await getProductById(Number(productId));
    if (!product) {
      log.warn({ productId }, "Producto no encontrado");
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    log.info({ productId }, "Producto encontrado");
    res.status(200).json(product);
  } catch (error: any) {
    log.warn({ error, params: req.params }, "Error al obtener producto");
    res.status(500).json({ message: "Error al obtener producto" });
  }
}

export async function getProductsByCategoryHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    const { categoryId } = req.params;
    log.info({ categoryId }, "Consulta de productos por categoría");
    const products = await getProductsByCategory(Number(categoryId));
    log.info({ categoryId, count: products.length }, "Productos por categoría obtenidos");
    res.status(200).json(products);
  } catch (error: any) {
    log.warn({ error, params: req.params }, "Error al obtener productos por categoría");
    res.status(500).json({ message: "Error al obtener productos por categoría" });
  }
}

export async function updateProductHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    const { productId } = req.params;
    log.info({ productId, body: req.body }, "Intento de actualizar producto");
    const { imageBase64, ...updateData } = req.body;
    let result = await updateProduct(Number(productId), updateData);
    // Si viene imagen en base64, procesar y guardar
    if (imageBase64) {
      let base64String = imageBase64;
      if (imageBase64.startsWith('data:')) {
        const parts = imageBase64.split(',');
        if (parts.length !== 2) {
          throw new Error('Formato base64 inválido');
        }
        base64String = parts[1];
      }
      // Validar base64
      try {
        const buffer = Buffer.from(base64String, 'base64');
        if (!buffer || buffer.length < 10) {
          throw new Error('Imagen base64 inválida o vacía');
        }
        await uploadProductImage(Number(productId), buffer);
      } catch (err) {
        log.warn({ error: err }, "Error al procesar imagen base64");
        throw new Error('La imagen enviada no es válida (base64)');
      }
    }
    log.info({ productId }, "Producto actualizado exitosamente");
    res.status(200).json(result);
  } catch (error: any) {
    log.warn({ error, params: req.params, body: req.body }, "Error al actualizar producto");
    res.status(400).json({ message: error.message });
  }
}

export async function disableProductHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    const { productId } = req.params;
    log.info({ productId }, "Intento de deshabilitar producto");
    await disableProduct(Number(productId));
    const product = await getProductById(Number(productId));
    log.info({ productId }, "Producto deshabilitado");
    res.status(200).json(product);
  } catch (error: any) {
    log.warn({ error, params: req.params }, "Error al deshabilitar producto");
    res.status(400).json({ message: error.message });
  }
}

export async function enableProductHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    const { productId } = req.params;
    log.info({ productId }, "Intento de habilitar producto");
    await enableProduct(Number(productId));
    const product = await getProductById(Number(productId));
    log.info({ productId }, "Producto habilitado");
    res.status(200).json(product);
  } catch (error: any) {
    log.warn({ error, params: req.params }, "Error al habilitar producto");
    res.status(400).json({ message: error.message });
  }
}

export async function uploadProductImageHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    const { productId } = req.params;

    if (!req.file) {
      log.warn({ productId }, "No se proporcionó ninguna imagen");
      return res.status(400).json({ message: "No se proporcionó ninguna imagen" });
    }

    log.info({ productId }, "Intento de subir imagen de producto");
    const result = await uploadProductImage(Number(productId), req.file.buffer);
    log.info({ productId }, "Imagen de producto subida correctamente");
    res.status(200).json(result);
  } catch (error: any) {
    log.warn({ error, params: req.params }, "Error al subir imagen de producto");
    res.status(400).json({ message: error.message });
  }
}

export async function deleteProductImageHandler(req: Request, res: Response) {
  const log = req.logger || logger;
  try {
    const { productId } = req.params;
    log.info({ productId }, "Intento de eliminar imagen de producto");
    const result = await deleteProductImage(Number(productId));
    log.info({ productId }, "Imagen de producto eliminada");
    res.status(200).json(result);
  } catch (error: any) {
    log.warn({ error, params: req.params }, "Error al eliminar imagen de producto");
    res.status(400).json({ message: error.message });
  }
}

 