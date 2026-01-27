import { z } from "zod";

export const createExpenseSchema = z.object({
  body: z.object({
    expenseTypeId: z.number().int().positive(),
    warehouseId: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    amount: z.number().positive("El monto debe ser mayor a 0"),
    currencyId: z.number().int().positive(),
    description: z.string().optional(),
  }),
});

export const cancelExpenseSchema = z.object({
  body: z.object({
    cancellationReason: z.string().min(10, "El motivo debe tener al menos 10 caracteres"),
  }),
  params: z.object({
    id: z.string(),
  }),
});

export const expenseIdSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});

export const getExpensesSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    warehouseId: z.string().optional(),
    expenseTypeId: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "CANCELLED"]).optional(),
  }),
});

export const getExpensesSummarySchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    warehouseId: z.string().optional(),
  }),
});

export const getExpensesReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    warehouseId: z.string().optional(),
    expenseTypeId: z.string().optional(),
    limit: z.string().optional(),
  }),
});
