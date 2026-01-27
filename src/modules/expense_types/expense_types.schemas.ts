import { z } from "zod";

export const createExpenseTypeSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre es requerido"),
    description: z.string().optional(),
  }),
});

export const updateExpenseTypeSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre es requerido").optional(),
    description: z.string().optional(),
  }),
  params: z.object({
    id: z.string(),
  }),
});

export const expenseTypeIdSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});
