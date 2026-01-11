import { Request, Response } from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  getProductsByCategory,
  updateProduct,
  disableProduct,
  enableProduct,
} from "./products.service";

export async function createProductHandler(req: Request, res: Response) {
  try {
    const product = await createProduct(req.body);
    res.status(201).json(product);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getProductsHandler(req: Request, res: Response) {
  try {
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    const products = await getAllProducts(active);
    res.status(200).json(products);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener productos" });
  }
}

export async function getProductHandler(req: Request, res: Response) {
  try {
    const { productId } = req.params;
    const product = await getProductById(Number(productId));
    if (!product) return res.status(404).json({ message: "Producto no encontrado" });
    res.status(200).json(product);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener producto" });
  }
}

export async function getProductsByCategoryHandler(req: Request, res: Response) {
  try {
    const { categoryId } = req.params;
    const products = await getProductsByCategory(Number(categoryId));
    res.status(200).json(products);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener productos por categoría" });
  }
}

export async function updateProductHandler(req: Request, res: Response) {
  try {
    const { productId } = req.params;
    const result = await updateProduct(Number(productId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function disableProductHandler(req: Request, res: Response) {
  try {
    const { productId } = req.params;
    const result = await disableProduct(Number(productId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function enableProductHandler(req: Request, res: Response) {
  try {
    const { productId } = req.params;
    const result = await enableProduct(Number(productId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
