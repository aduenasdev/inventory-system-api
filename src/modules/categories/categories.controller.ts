import { Request, Response } from "express";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  disableCategory,
  enableCategory,
  deleteCategory,
} from "./categories.service";

export async function createCategoryHandler(req: Request, res: Response) {
  try {
    const category = await createCategory(req.body);
    res.status(201).json(category);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getCategoriesHandler(req: Request, res: Response) {
  try {
    const categories = await getAllCategories();
    res.status(200).json(categories);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener categorías" });
  }
}

export async function getCategoryHandler(req: Request, res: Response) {
  try {
    const { categoryId } = req.params;
    const category = await getCategoryById(Number(categoryId));
    if (!category) return res.status(404).json({ message: "Categoría no encontrada" });
    res.status(200).json(category);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener categoría" });
  }
}

export async function updateCategoryHandler(req: Request, res: Response) {
  try {
    const { categoryId } = req.params;
    const result = await updateCategory(Number(categoryId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function disableCategoryHandler(req: Request, res: Response) {
  try {
    const { categoryId } = req.params;
    const result = await disableCategory(Number(categoryId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function enableCategoryHandler(req: Request, res: Response) {
  try {
    const { categoryId } = req.params;
    const result = await enableCategory(Number(categoryId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function deleteCategoryHandler(req: Request, res: Response) {
  try {
    const { categoryId } = req.params;
    const result = await deleteCategory(Number(categoryId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
