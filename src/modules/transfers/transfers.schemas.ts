import { z } from "zod";

export const createTransferSchema = z.object({
  body: z.object({
    date: z.string(),
    originWarehouseId: z.number().int().positive(),
    destinationWarehouseId: z.number().int().positive(),
    notes: z.string().optional(),
    details: z.array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
      })
    ).min(1),
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
    rejectionReason: z.string().min(1),
  }),
});

export const getTransfersByWarehouseSchema = z.object({
  query: z.object({
    warehouseId: z.string(),
  }),
});

export const getRejectedTransfersReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  }),
});
