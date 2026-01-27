import { Request, Response, NextFunction } from "express";
import {
  createExpenseType,
  getAllExpenseTypes,
  getExpenseTypeById,
  updateExpenseType,
  disableExpenseType,
  enableExpenseType,
  deleteExpenseType,
} from "./expense_types.service";

export async function createExpenseTypeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const expenseType = await createExpenseType(req.body);
    res.status(201).json({
      message: "Tipo de gasto creado exitosamente",
      data: expenseType,
    });
  } catch (error) {
    next(error);
  }
}

export async function getExpenseTypesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // Si la ruta es /active, forzar active=true
    if (req.path === "/active") {
      const expenseTypes = await getAllExpenseTypes(true);
      return res.status(200).json(expenseTypes);
    }

    const active = req.query.active === "true" ? true : req.query.active === "false" ? false : undefined;
    const expenseTypes = await getAllExpenseTypes(active);
    res.status(200).json(expenseTypes);
  } catch (error) {
    next(error);
  }
}

export async function getExpenseTypeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const expenseType = await getExpenseTypeById(Number(id));
    res.status(200).json(expenseType);
  } catch (error) {
    next(error);
  }
}

export async function updateExpenseTypeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await updateExpenseType(Number(id), req.body);
    res.status(200).json({
      message: "Tipo de gasto actualizado exitosamente",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function disableExpenseTypeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await disableExpenseType(Number(id));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function enableExpenseTypeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await enableExpenseType(Number(id));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteExpenseTypeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await deleteExpenseType(Number(id));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
