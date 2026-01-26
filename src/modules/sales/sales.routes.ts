import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  createSale,
  getAllSales,
  getSaleById,
  acceptSale,
  cancelSale,
  markSaleAsPaid,
  getDailySalesReport,
  getCancelledSalesReport,
  getSalesTotalsReport,
  getSaleLotConsumptions,
  getSalesMarginReport,
  getAvailableProducts,
  getUserWarehouses,
  checkExchangeRates,
  getCurrencies,
  getPaymentTypes,
  getCategories,
  getUnits,
  getSalesReport,
} from "./sales.controller";
import {
  createSaleSchema,
  getSaleByIdSchema,
  acceptSaleSchema,
  cancelSaleSchema,
  markSaleAsPaidSchema,
  getDailySalesReportSchema,
  getCancelledSalesReportSchema,
  getSalesTotalsReportSchema,
  getAllSalesSchema,
  getSalesMarginReportSchema,
  getAvailableProductsSchema,
  checkExchangeRatesSchema,
  getSalesReportSchema,
} from "./sales.schemas";

const router = Router();

// ========== ENDPOINTS PARA CREAR VENTAS ==========

// GET /sales/warehouses - Obtener almacenes disponibles del usuario
// Usar este endpoint primero para mostrar selector de almacén
router.get(
  "/warehouses",
  authMiddleware,
  hasPermission("sales.create"),
  getUserWarehouses
);

// GET /sales/currencies - Obtener monedas activas
router.get(
  "/currencies",
  authMiddleware,
  hasPermission("sales.create"),
  getCurrencies
);

// GET /sales/payment-types - Obtener tipos de pago activos
router.get(
  "/payment-types",
  authMiddleware,
  hasPermission("sales.create"),
  getPaymentTypes
);

// GET /sales/categories - Obtener categorías activas
router.get(
  "/categories",
  authMiddleware,
  hasPermission("sales.create"),
  getCategories
);

// GET /sales/units - Obtener unidades activas
router.get(
  "/units",
  authMiddleware,
  hasPermission("sales.create"),
  getUnits
);

// GET /sales/exchange-rates - Verificar tasas de cambio disponibles
// Usar este endpoint para verificar si se puede crear una venta con una moneda específica
router.get(
  "/exchange-rates",
  authMiddleware,
  hasPermission("sales.create"),
  validate(checkExchangeRatesSchema),
  checkExchangeRates
);

// GET /sales/products/:warehouseId - Obtener productos disponibles en un almacén
// Solo muestra productos con stock > 0 en almacenes del usuario
router.get(
  "/products/:warehouseId",
  authMiddleware,
  hasPermission("sales.create"),
  validate(getAvailableProductsSchema),
  getAvailableProducts
);

// ========== LISTADOS Y REPORTES ==========

// GET /sales - Listar ventas según permisos del usuario
// Requiere rango de fechas: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Si solo se envía startDate, muestra las de ese día
// Filtrado por permisos:
// - sales.read: ve todas
// - sales.cancel: ve PENDING + APPROVED  
// - sales.accept: ve PENDING
// - sales.create: ve solo las que creó
// Filtro adicional isPaid solo disponible con permiso sales.paid
router.get(
  "/",
  authMiddleware,
  validate(getAllSalesSchema),
  getAllSales
);

// GET /sales/reports/daily - Reporte de ventas diarias
router.get(
  "/reports/daily",
  authMiddleware,
  hasPermission("sales.read"),
  validate(getDailySalesReportSchema),
  getDailySalesReport
);

// GET /sales/reports/cancelled - Reporte de facturas canceladas
router.get(
  "/reports/cancelled",
  authMiddleware,
  hasPermission("sales.read"),
  validate(getCancelledSalesReportSchema),
  getCancelledSalesReport
);

// GET /sales/reports/advanced - Reporte avanzado de ventas con filtros
// Retorna: ventas filtradas + opciones de filtro para el frontend
// Filtros: warehouseId, productId, categoryId, currencyId, paymentTypeId,
//          status, isPaid, createdById, customerId, invoiceNumber
router.get(
  "/reports/advanced",
  authMiddleware,
  hasPermission("reports.sales.read"),
  validate(getSalesReportSchema),
  getSalesReport
);

// GET /sales/reports/totals - Reporte de totales de ventas por período
router.get(
  "/reports/totals",
  authMiddleware,
  hasPermission("sales.read"),
  validate(getSalesTotalsReportSchema),
  getSalesTotalsReport
);

// GET /sales/reports/margin - Reporte de margen real de ventas
router.get(
  "/reports/margin",
  authMiddleware,
  hasPermission("sales.read"),
  validate(getSalesMarginReportSchema),
  getSalesMarginReport
);

// GET /sales/:id - Obtener una venta por ID
router.get(
  "/:id",
  authMiddleware,
  hasPermission("sales.read"),
  validate(getSaleByIdSchema),
  getSaleById
);

// GET /sales/:id/lot-consumptions - Consumos de lotes de una venta
router.get(
  "/:id/lot-consumptions",
  authMiddleware,
  hasPermission("sales.read"),
  getSaleLotConsumptions
);

// POST /sales - Crear factura de venta
router.post(
  "/",
  authMiddleware,
  hasPermission("sales.create"),
  validate(createSaleSchema),
  createSale
);

// POST /sales/:id/accept - Aceptar factura
router.post(
  "/:id/accept",
  authMiddleware,
  hasPermission("sales.accept"),
  validate(acceptSaleSchema),
  acceptSale
);

// POST /sales/:id/cancel - Cancelar factura
router.post(
  "/:id/cancel",
  authMiddleware,
  hasPermission("sales.cancel"),
  validate(cancelSaleSchema),
  cancelSale
);

// POST /sales/:id/paid - Marcar factura como pagada/cobrada
// Este endpoint solo cambia el estado de pago, no afecta inventario
router.post(
  "/:id/paid",
  authMiddleware,
  hasPermission("sales.paid"),
  validate(markSaleAsPaidSchema),
  markSaleAsPaid
);

export default router;
