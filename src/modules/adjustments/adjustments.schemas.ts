import { z } from "zod";

export const createAdjustmentSchema = z.object({
  body: z.object({
    adjustmentTypeId: z.number().int().positive(),
    warehouseId: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    reason: z.string().optional(),
    details: z
      .array(
        z.object({
          productId: z.number().int().positive(),
          quantity: z.number().positive("La cantidad debe ser mayor a 0"),
        })
      )
      .min(1, "Debe incluir al menos un producto"),
  }),
});

export const cancelAdjustmentSchema = z.object({
  body: z.object({
    cancellationReason: z.string().min(10, "El motivo debe tener al menos 10 caracteres"),
  }),
  params: z.object({
    id: z.string(),
  }),
});

export const adjustmentIdSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});

export const getAdjustmentsSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    warehouseId: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "CANCELLED"]).optional(),
  }),
});
