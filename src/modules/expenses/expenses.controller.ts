import { Request, Response, NextFunction } from "express";
import { expensesService } from "./expenses.service";

// ========== ENDPOINTS AUXILIARES ==========

export async function getWarehouses(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const warehouses = await expensesService.getUserWarehouses(userId);
    res.status(200).json(warehouses);
  } catch (error) {
    next(error);
  }
}

export async function getExpenseTypes(req: Request, res: Response, next: NextFunction) {
  try {
    const types = await expensesService.getExpenseTypes();
    res.status(200).json(types);
  } catch (error) {
    next(error);
  }
}

export async function getCurrencies(req: Request, res: Response, next: NextFunction) {
  try {
    const currencies = await expensesService.getCurrencies();
    res.status(200).json(currencies);
  } catch (error) {
    next(error);
  }
}

// ========== CRUD DE GASTOS ==========

export async function createExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const result = await expensesService.create({
      ...req.body,
      userId,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getAllExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, warehouseId, expenseTypeId, status } = req.query;

    const expenses = await expensesService.getAll(
      userId,
      startDate as string,
      endDate as string,
      warehouseId ? Number(warehouseId) : undefined,
      expenseTypeId ? Number(expenseTypeId) : undefined,
      status as string | undefined
    );

    res.status(200).json(expenses);
  } catch (error) {
    next(error);
  }
}

export async function getExpenseById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const expense = await expensesService.getById(Number(id));
    res.status(200).json(expense);
  } catch (error) {
    next(error);
  }
}

export async function acceptExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const result = await expensesService.accept(Number(id), userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function cancelExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { cancellationReason } = req.body;
    const result = await expensesService.cancel(Number(id), cancellationReason, userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getExpensesSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, warehouseId } = req.query;

    const summary = await expensesService.getSummary(
      userId,
      startDate as string,
      endDate as string,
      warehouseId ? Number(warehouseId) : undefined
    );

    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}

export async function getExpensesReport(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, warehouseId, expenseTypeId, limit } = req.query;

    const report = await expensesService.getReport(
      userId,
      startDate as string,
      endDate as string,
      warehouseId ? Number(warehouseId) : undefined,
      expenseTypeId ? Number(expenseTypeId) : undefined,
      limit ? Number(limit) : 10
    );

    res.status(200).json(report);
  } catch (error) {
    next(error);
  }
}
