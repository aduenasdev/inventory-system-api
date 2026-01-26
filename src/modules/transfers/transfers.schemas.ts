import { z } from "zod";

export const createTransferSchema = z.object({
  body: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    backdateReason: z.string().min(10, "El motivo de fecha retroactiva debe tener al menos 10 caracteres").optional(),
    originWarehouseId: z.number().int().positive(),
    destinationWarehouseId: z.number().int().positive(),
    notes: z.string().optional(),
    details: z.array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
      })
    ).min(1, "El traslado debe tener al menos un producto"),
  }),
});

export const acceptTransferSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});

export const rejectTransferSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    rejectionReason: z.string().min(1, "El motivo de rechazo es requerido"),
  }),
});

export const cancelTransferSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
  body: z.object({
    cancellationReason: z.string().min(10, "El motivo de anulación debe tener al menos 10 caracteres"),
  }),
});

export const getAllTransfersSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    warehouseId: z.string().optional(),
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  }),
});

export const getAvailableProductsSchema = z.object({
  params: z.object({
    warehouseId: z.string(),
  }),
  query: z.object({
    search: z.string().optional(),
    categoryId: z.string().optional(),
  }),
});

export const getRejectedTransfersReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  }),
});

export const getCancelledTransfersReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  }),
});
