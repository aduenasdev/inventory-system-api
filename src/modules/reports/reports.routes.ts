import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  getStockReport,
  getValorizedStock,
  getLowStock,
  getMovementsReport,
  getKardex,
  getProfitReport,
  exportProfitReportCSV,
  getInventoryValuation,
  exportInventoryValuationCSV,
} from "./reports.controller";
import {
  getStockReportSchema,
  getValorizedStockSchema,
  getLowStockSchema,
  getMovementsReportSchema,
  getKardexSchema,
  getProfitReportSchema,
  exportProfitReportSchema,
  getInventoryValuationSchema,
  exportInventoryValuationSchema,
} from "./reports.schemas";

const router = Router();

// ========== REPORTE 1: STOCK ACTUAL ==========
// GET /reports/stock - Stock actual de productos por almacén
// Filtros: warehouseId (opcional), productId (opcional), categoryId (opcional)
router.get(
  "/stock",
  authMiddleware,
  hasPermission("reports.stock.read"),
  validate(getStockReportSchema),
  getStockReport
);

// ========== REPORTE 2: STOCK VALORIZADO ==========
// GET /reports/stock/valorized - Stock con costo total en CUP
// Filtros: warehouseId (opcional), productId (opcional), categoryId (opcional)
router.get(
  "/stock/valorized",
  authMiddleware,
  hasPermission("reports.stock.valorized"),
  validate(getValorizedStockSchema),
  getValorizedStock
);

// ========== REPORTE 3: BAJO MÍNIMO ==========
// GET /reports/low-stock - Productos sin stock o bajo mínimo
// Filtros: warehouseId (opcional), minThreshold (optional, default: 10)
router.get(
  "/low-stock",
  authMiddleware,
  hasPermission("reports.stock.read"),
  validate(getLowStockSchema),
  getLowStock
);

// ========== REPORTE 4: MOVIMIENTOS ==========
// GET /reports/movements - Historial de movimientos de inventario
// Filtros: startDate (obligatorio), endDate (opcional), warehouseId (opcional), 
//          type (opcional: INVOICE_ENTRY, SALE_EXIT, TRANSFER_ENTRY, TRANSFER_EXIT, ADJUSTMENT_ENTRY, ADJUSTMENT_EXIT),
//          productId (opcional)
router.get(
  "/movements",
  authMiddleware,
  hasPermission("reports.movements.read"),
  validate(getMovementsReportSchema),
  getMovementsReport
);

// ========== REPORTE 5: KARDEX ==========
// GET /reports/kardex - Historial de movimientos de un producto específico
// Parámetros: productId (obligatorio)
// Filtros: warehouseId (opcional), startDate (opcional), endDate (opcional)
router.get(
  "/kardex",
  authMiddleware,
  hasPermission("reports.movements.read"),
  validate(getKardexSchema),
  getKardex
);

// ========== REPORTE 6: UTILIDAD/GANANCIA ==========
// GET /reports/profit - Estado de resultados (ingresos, costos, gastos, utilidad)
// Parámetros: startDate (obligatorio), endDate (opcional)
// Filtros: warehouseId (opcional), includeDetails (opcional)
router.get(
  "/profit",
  authMiddleware,
  hasPermission("reports.profit.read"),
  validate(getProfitReportSchema),
  getProfitReport
);

// ========== EXPORTAR REPORTE DE UTILIDAD ==========
// GET /reports/profit/export - Exportar reporte de utilidad en CSV
// Parámetros: startDate (obligatorio), endDate (opcional)
// Filtros: warehouseId (opcional)
router.get(
  "/profit/export",
  authMiddleware,
  hasPermission("reports.profit.read"),
  validate(exportProfitReportSchema),
  exportProfitReportCSV
);

// ========== REPORTE 7: INVENTARIO VALORIZADO (NIC 2) ==========
// GET /reports/inventory - Informe completo de inventario con valuación FIFO
// Filtros: warehouseId, categoryId, productId, cutoffDate, onlyWithStock, onlyBelowMin
// Opciones: groupBy (warehouse|category|supplier|age), includeMovements, includeKardex
router.get(
  "/inventory",
  authMiddleware,
  hasPermission("reports.stock.valorized"),
  validate(getInventoryValuationSchema),
  getInventoryValuation
);

// ========== EXPORTAR INVENTARIO VALORIZADO ==========
// GET /reports/inventory/export - Exportar informe de inventario en CSV
// Filtros: warehouseId, categoryId
router.get(
  "/inventory/export",
  authMiddleware,
  hasPermission("reports.stock.valorized"),
  validate(exportInventoryValuationSchema),
  exportInventoryValuationCSV
);

export default router;
