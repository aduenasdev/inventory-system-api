import { z } from "zod";

export const createSaleSchema = z.object({
  body: z.object({
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    warehouseId: z.number().int().positive(),
    currencyId: z.number().int().positive(),
    paymentTypeId: z.number().int().positive().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(), // Fecha de la venta (default: hoy)
    backdateReason: z.string().min(10, "Debe indicar el motivo de la fecha retroactiva (mínimo 10 caracteres)").optional(),
    notes: z.string().optional(),
    autoApprove: z.boolean().optional().default(false), // Si true y tiene permiso, crea directo en APPROVED
    details: z.array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
        unitPrice: z.number().positive(),
        paymentTypeId: z.number().int().positive(),
      })
    ).min(1, "Debe incluir al menos un producto"),
  }),
});

export const getSaleByIdSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
});

export const acceptSaleSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
});

export const cancelSaleSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
  body: z.object({
    cancellationReason: z.string().min(10, "El motivo debe tener al menos 10 caracteres"),
  }),
});

export const markSaleAsPaidSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
});

export const getDailySalesReportSchema = z.object({
  query: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

export const getCancelledSalesReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  }),
});

export const getSalesTotalsReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    targetCurrencyId: z.string().transform(Number),
  }),
});

// Schema para listar ventas con rango de fechas obligatorio
export const getAllSalesSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    warehouseId: z.string().transform(Number).optional(),
    status: z.enum(["PENDING", "APPROVED", "CANCELLED"]).optional(),
    isPaid: z.enum(["true", "false"]).optional(),
  }),
});

export const getSalesMarginReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    warehouseId: z.string().transform(Number).optional(),
  }),
});

// Schema para obtener productos disponibles para vender en un almacén
export const getAvailableProductsSchema = z.object({
  params: z.object({
    warehouseId: z.string().transform(Number),
  }),
  query: z.object({
    search: z.string().optional(), // Buscar por nombre o código
    categoryId: z.string().transform(Number).optional(),
  }),
});

// Schema para verificar tasas de cambio
export const checkExchangeRatesSchema = z.object({
  query: z.object({
    currencyId: z.string().transform(Number), // Moneda de la factura
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido, use YYYY-MM-DD").optional(),
  }),
});
