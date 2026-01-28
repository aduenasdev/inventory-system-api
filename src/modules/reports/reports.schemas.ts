import { z } from "zod";

// ========== STOCK ACTUAL ==========
export const getStockReportSchema = z.object({
  query: z.object({
    warehouseId: z.string().transform(Number).optional(), // Filtro por almacén
    productId: z.string().transform(Number).optional(), // Filtro por producto específico
    categoryId: z.string().transform(Number).optional(), // Filtro por categoría
  }),
});

// ========== STOCK VALORIZADO ==========
export const getValorizedStockSchema = z.object({
  query: z.object({
    warehouseId: z.string().transform(Number).optional(), // Filtro por almacén
    productId: z.string().transform(Number).optional(), // Filtro por producto específico
    categoryId: z.string().transform(Number).optional(), // Filtro por categoría
  }),
});

// ========== BAJO MÍNIMO ==========
export const getLowStockSchema = z.object({
  query: z.object({
    warehouseId: z.string().transform(Number).optional(), // Filtro por almacén
  }),
});

// ========== MOVIMIENTOS ==========
export const getMovementsReportSchema = z.object({
  query: z.object({
    warehouseId: z.string().transform(Number).optional(), // Filtro por almacén
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    type: z.enum(["INVOICE_ENTRY", "SALE_EXIT", "TRANSFER_ENTRY", "TRANSFER_EXIT", "ADJUSTMENT_ENTRY", "ADJUSTMENT_EXIT"]).optional(), // Tipo de movimiento
    productId: z.string().transform(Number).optional(), // Filtro por producto
  }),
});

// ========== KARDEX ==========
export const getKardexSchema = z.object({
  query: z.object({
    productId: z.string().transform(Number), // Obligatorio
    warehouseId: z.string().transform(Number).optional(), // Filtro por almacén
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
  }),
});

// ========== PROFIT REPORT (UTILIDAD) ==========
export const getProfitReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    warehouseId: z.string().transform(Number).optional(),
    includeDetails: z.string().transform((val) => val === "true").optional(),
  }),
});

// ========== EXPORT PROFIT REPORT ==========
export const exportProfitReportSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),
    warehouseId: z.string().transform(Number).optional(),
  }),
});

// ========== INVENTORY VALUATION REPORT (INFORME DE INVENTARIO) ==========
export const getInventoryValuationSchema = z.object({
  query: z.object({
    warehouseId: z.string().transform(Number).optional(),    // Filtro por almacén
    categoryId: z.string().transform(Number).optional(),     // Filtro por categoría
    productId: z.string().transform(Number).optional(),      // Filtro por producto específico
    cutoffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(), // Corte a fecha
    onlyWithStock: z.string().transform((val) => val === "true").optional(),   // Solo productos con stock
    onlyBelowMin: z.string().transform((val) => val === "true").optional(),    // Solo bajo mínimo
    groupBy: z.enum(["warehouse", "category", "supplier", "age"]).optional(),  // Agrupación principal
    includeMovements: z.string().transform((val) => val === "true").optional(), // Incluir movimientos del período
    includeKardex: z.string().transform((val) => val === "true").optional(),   // Incluir kardex por producto
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(), // Para movimientos
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)").optional(),   // Para movimientos
  }),
});

// ========== EXPORT INVENTORY VALUATION ==========
export const exportInventoryValuationSchema = z.object({
  query: z.object({
    warehouseId: z.string().transform(Number).optional(),
    categoryId: z.string().transform(Number).optional(),
    format: z.enum(["csv", "excel", "pdf"]).optional().default("csv"),
  }),
});
