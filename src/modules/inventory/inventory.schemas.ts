import { z } from "zod";

export const getStockByWarehouseAndProductSchema = z.object({
  params: z.object({
    warehouseId: z.string().transform(Number),
    productId: z.string().transform(Number),
  }),
});

export const getStockByWarehouseSchema = z.object({
  params: z.object({
    warehouseId: z.string().transform(Number),
  }),
});

export const getProductKardexSchema = z.object({
  params: z.object({
    productId: z.string().transform(Number),
  }),
});

export const createAdjustmentSchema = z.object({
  body: z.object({
    type: z.enum(["ADJUSTMENT_ENTRY", "ADJUSTMENT_EXIT"]),
    warehouseId: z.number().int().positive(),
    productId: z.number().int().positive(),
    quantity: z.number().positive(),
    reason: z.string().min(10, "El motivo debe tener al menos 10 caracteres"),
    currencyId: z.number().int().positive().optional(), // Solo para entradas
    unitCost: z.number().positive().optional(), // Solo para entradas
    exchangeRate: z.number().positive().optional(), // Solo para entradas
  }),
});

export const approveAdjustmentSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
});

export const getInventoryValueReportSchema = z.object({
  query: z.object({
    warehouseId: z.string().transform(Number).optional(),
  }),
});

export const getAdjustmentsReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    warehouseId: z.string().transform(Number).optional(),
  }),
});

// ========== SCHEMAS DE LOTES ==========

export const getLotsByWarehouseSchema = z.object({
  params: z.object({
    warehouseId: z.string().transform(Number),
  }),
});

export const getActiveLotsByProductSchema = z.object({
  params: z.object({
    productId: z.string().transform(Number),
    warehouseId: z.string().transform(Number),
  }),
});

export const getLotByIdSchema = z.object({
  params: z.object({
    lotId: z.string().transform(Number),
  }),
});

export const getLotKardexSchema = z.object({
  params: z.object({
    lotId: z.string().transform(Number),
  }),
});
