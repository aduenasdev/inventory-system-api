import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  acceptPurchase,
  cancelPurchase,
  getCancelledPurchasesReport,
  getPurchasesReport,
  getUserWarehouses,
  getProducts,
  getCurrencies,
  checkExchangeRates,
  getCategories,
  getUnits,
} from "./purchases.controller";
import {
  createPurchaseSchema,
  getPurchaseByIdSchema,
  acceptPurchaseSchema,
  cancelPurchaseSchema,
  getCancelledPurchasesReportSchema,
  getPurchasesReportSchema,
  getAllPurchasesSchema,
  getProductsSchema,
  checkExchangeRatesSchema,
} from "./purchases.schemas";

const router = Router();

// ========== ENDPOINTS AUXILIARES PARA FRONTEND (deben ir antes de rutas con :id) ==========

// GET /purchases/warehouses - Obtener almacenes disponibles del usuario
router.get(
  "/warehouses",
  authMiddleware,
  hasPermission("purchases.create"),
  getUserWarehouses
);

// GET /purchases/products - Obtener productos disponibles para comprar
router.get(
  "/products",
  authMiddleware,
  hasPermission("purchases.create"),
  validate(getProductsSchema),
  getProducts
);

// GET /purchases/currencies - Obtener monedas disponibles
router.get(
  "/currencies",
  authMiddleware,
  hasPermission("purchases.create"),
  getCurrencies
);

// GET /purchases/exchange-rates - Verificar tasas de cambio disponibles
router.get(
  "/exchange-rates",
  authMiddleware,
  hasPermission("purchases.create"),
  validate(checkExchangeRatesSchema),
  checkExchangeRates
);

// GET /purchases/categories - Obtener categorías para filtrar productos
router.get(
  "/categories",
  authMiddleware,
  hasPermission("purchases.create"),
  getCategories
);

// GET /purchases/units - Obtener unidades de medida
router.get(
  "/units",
  authMiddleware,
  hasPermission("purchases.create"),
  getUnits
);

// ========== RUTAS PRINCIPALES ==========

// GET /purchases - Listar compras según permisos del usuario
// Requiere rango de fechas: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Si solo se envía startDate, muestra las de ese día
// Filtrado por permisos:
// - purchases.read: ve todas
// - purchases.cancel: ve PENDING + APPROVED  
// - purchases.accept: ve PENDING
// - purchases.create: ve solo las que creó
router.get(
  "/",
  authMiddleware,
  validate(getAllPurchasesSchema),
  getAllPurchases
);

// GET /purchases/reports/cancelled - Reporte de facturas canceladas
router.get(
  "/reports/cancelled",
  authMiddleware,
  hasPermission("purchases.read"),
  validate(getCancelledPurchasesReportSchema),
  getCancelledPurchasesReport
);

// GET /purchases/report - Reporte completo de compras
router.get(
  "/report",
  authMiddleware,
  hasPermission("purchases.read"),
  validate(getPurchasesReportSchema),
  getPurchasesReport
);

// GET /purchases/:id - Obtener una compra por ID
router.get(
  "/:id",
  authMiddleware,
  hasPermission("purchases.read"),
  validate(getPurchaseByIdSchema),
  getPurchaseById
);

// POST /purchases - Crear factura de compra
router.post(
  "/",
  authMiddleware,
  hasPermission("purchases.create"),
  validate(createPurchaseSchema),
  createPurchase
);

// POST /purchases/:id/accept - Aceptar factura
router.post(
  "/:id/accept",
  authMiddleware,
  hasPermission("purchases.accept"),
  validate(acceptPurchaseSchema),
  acceptPurchase
);

// POST /purchases/:id/cancel - Cancelar factura
router.post(
  "/:id/cancel",
  authMiddleware,
  hasPermission("purchases.cancel"),
  validate(cancelPurchaseSchema),
  cancelPurchase
);

export default router;
