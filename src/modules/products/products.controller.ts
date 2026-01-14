import { Request, Response } from "express";
import logger from "../../utils/logger";
import { asyncHandler } from "../../middlewares/errorHandler";
import { parseBase64Image } from "../../utils/imageProcessing";
import path from "path";
import fs from "fs";
import {
  createProduct,
  getAllProducts,
  getProductById,
  getProductsByCategory,
  updateProduct,
  uploadProductImage,
  deleteProductImage,
  deleteProduct,
} from "./products.service";

// Retorna la imagen grande del producto
export async function getProductImageHandler(req: Request, res: Response) {
  const { productId } = req.params;
  const imagePath = path.join(__dirname, "..", "..", "..", "uploads", "products", `${productId}.webp`);
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ message: "Imagen no encontrada" });
  }
}

// Retorna la miniatura del producto
export async function getProductThumbnailHandler(req: Request, res: Response) {
  const { productId } = req.params;
  const thumbPath = path.join(__dirname, "..", "..", "..", "uploads", "products", `${productId}_thumb.webp`);
  if (fs.existsSync(thumbPath)) {
    res.sendFile(thumbPath);
  } else {
    res.status(404).json({ message: "Miniatura no encontrada" });
  }
}

export const createProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const log = req.logger || logger;
  log.info({ body: req.body }, "Intento de crear producto");
  
  const dataWithCreatedBy = { ...req.body, createdBy: req.user!.id };
  const product = await createProduct(dataWithCreatedBy);
  
  log.info({ product }, "Producto creado exitosamente");
  res.status(201).json(product);
});

export const getProductsHandler = asyncHandler(async (req: Request, res: Response) => {
  const log = req.logger || logger;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
  const name = req.query.name ? String(req.query.name) : undefined;
  const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string, 10) : undefined;
  
  log.info({ page, pageSize, name, categoryId }, "Consulta de productos paginada y filtrada");
  const result = await getAllProducts({ page, pageSize, name, categoryId });
  log.info({ total: result.total, page, pageSize, name, categoryId }, "Productos obtenidos");
  
  res.status(200).json(result);
});

export const getProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const log = req.logger || logger;
  const { productId } = req.params;
  
  log.info({ productId }, "Consulta de producto por ID");
  const product = await getProductById(Number(productId));
  
  if (!product) {
    log.warn({ productId }, "Producto no encontrado");
    return res.status(404).json({ message: "Producto no encontrado" });
  }
  
  log.info({ productId }, "Producto encontrado");
  res.status(200).json(product);
});

export const getProductsByCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const log = req.logger || logger;
  const { categoryId } = req.params;
  
  log.info({ categoryId }, "Consulta de productos por categoría");
  const products = await getProductsByCategory(Number(categoryId));
  log.info({ categoryId, count: products.length }, "Productos por categoría obtenidos");
  
  res.status(200).json(products);
});

export const updateProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const log = req.logger || logger;
  const { productId } = req.params;
  
  log.info({ productId, body: req.body }, "Intento de actualizar producto");
  const result = await updateProduct(Number(productId), req.body);
  
  log.info({ productId }, "Producto actualizado exitosamente");
  res.status(200).json(result);
});

export const uploadProductImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const log = req.logger || logger;
  const { productId } = req.params;

  if (!req.file) {
    log.warn({ productId }, "No se proporcionó ninguna imagen");
    return res.status(400).json({ message: "No se proporcionó ninguna imagen" });
  }

  log.info({ productId }, "Intento de subir imagen de producto");
  const result = await uploadProductImage(Number(productId), req.file.buffer);
  log.info({ productId }, "Imagen de producto subida correctamente");
  
  res.status(200).json(result);
});

export const deleteProductImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const log = req.logger || logger;
  const { productId } = req.params;
  
  log.info({ productId }, "Intento de eliminar imagen de producto");
  const result = await deleteProductImage(Number(productId));
  log.info({ productId }, "Imagen de producto eliminada");
  
  res.status(200).json(result);
});

export const deleteProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const log = req.logger || logger;
  const { productId } = req.params;
  
  log.info({ productId }, "Intento de eliminar producto");
  const result = await deleteProduct(Number(productId));
  log.info({ productId }, "Producto eliminado exitosamente");
  
  res.status(200).json(result);
});

 