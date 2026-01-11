import { z } from "zod";

export const createPurchaseSchema = z.object({
  body: z.object({
    supplierName: z.string().optional(),
    supplierPhone: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    warehouseId: z.number().int().positive(),
    currencyId: z.number().int().positive(),
    notes: z.string().optional(),
    details: z.array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
        unitCost: z.number().positive(),
      })
    ).min(1, "Debe incluir al menos un producto"),
  }),
});

export const getPurchaseByIdSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
});

export const acceptPurchaseSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
});

export const cancelPurchaseSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
  body: z.object({
    cancellationReason: z.string().min(10, "El motivo debe tener al menos 10 caracteres"),
  }),
});

export const getCancelledPurchasesReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});
