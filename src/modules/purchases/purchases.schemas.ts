import { z } from "zod";

export const createPurchaseSchema = z.object({
  body: z.object({
    supplierName: z.string().optional(),
    supplierPhone: z.string().optional(),
    warehouseId: z.number().int().positive(),
    currencyId: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(), // Fecha de la compra (default: hoy)
    notes: z.string().optional(),
    autoApprove: z.boolean().optional().default(false), // Si true y tiene permiso, crea directo en APPROVED
    details: z.array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
        unitCost: z.number().nonnegative().optional(), // Opcional: si no tiene permiso purchases.price, puede omitirlo
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

// Schema para listar compras con rango de fechas obligatorio
export const getAllPurchasesSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    warehouseId: z.string().transform(Number).optional(),
    status: z.enum(["PENDING", "APPROVED", "CANCELLED"]).optional(),
  }),
});

// ========== SCHEMAS PARA ENDPOINTS AUXILIARES ==========

// Schema para obtener productos
export const getProductsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    categoryId: z.string().transform(Number).optional(),
  }),
});

// Schema para verificar tasas de cambio
export const checkExchangeRatesSchema = z.object({
  query: z.object({
    currencyId: z.string().transform(Number),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido, use YYYY-MM-DD").optional(),
  }),
});

// Schema para reporte de compras
export const getPurchasesReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido"),
    warehouseId: z.string().transform(Number).optional(),
    limit: z.string().transform(Number).optional(),
  }),
});

// Schema para asignar precios a una compra (desbloquear lotes)
export const assignPricingSchema = z.object({
  params: z.object({
    id: z.string().transform(Number),
  }),
  body: z.object({
    currencyId: z.number().int().positive("Debe especificar la moneda de los precios"),
    pricing: z.array(
      z.object({
        detailId: z.number().int().positive("ID del detalle inválido"),
        unitCost: z.number().positive("El costo unitario debe ser mayor a 0"),
      })
    ).min(1, "Debe incluir al menos un precio"),
  }),
});