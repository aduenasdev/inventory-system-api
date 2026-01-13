
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
    const product = await createProduct(req.body);
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
    const result = await updateProduct(Number(productId), req.body);
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
    const result = await disableProduct(Number(productId));
    log.info({ productId }, "Producto deshabilitado");
    res.status(200).json(result);
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
    const result = await enableProduct(Number(productId));
    log.info({ productId }, "Producto habilitado");
    res.status(200).json(result);
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

 