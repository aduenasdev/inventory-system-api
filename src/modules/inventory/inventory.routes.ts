import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  getInventoryList,
  getStockByWarehouseAndProduct,
  getProductKardex,
  createAdjustment,
  getInventoryValueReport,
  getAdjustmentsReport,
  getLotsByWarehouse,
  getActiveLotsByProduct,
  getLotById,
  getLotKardex,
} from "./inventory.controller";
import {
  getInventoryListSchema,
  getStockByWarehouseAndProductSchema,
  getProductKardexSchema,
  createAdjustmentSchema,
  getInventoryValueReportSchema,
  getAdjustmentsReportSchema,
  getLotsByWarehouseSchema,
  getActiveLotsByProductSchema,
  getLotByIdSchema,
  getLotKardexSchema,
} from "./inventory.schemas";

const router = Router();

// ========== RUTA PRINCIPAL DE INVENTARIO ==========

// GET /inventory - Listar inventario con paginación y filtros
router.get(
  "/",
  authMiddleware,
  hasPermission("inventory.read"),
  validate(getInventoryListSchema),
  getInventoryList
);

// ========== RUTAS DE LOTES (primero para evitar conflictos con :warehouseId) ==========

// GET /inventory/lots/warehouse/:warehouseId - Listar lotes de un establecimiento
router.get(
  "/lots/warehouse/:warehouseId",
  authMiddleware,
  hasPermission("inventory.lots.read"),
  validate(getLotsByWarehouseSchema),
  getLotsByWarehouse
);

// GET /inventory/lots/product/:productId/warehouse/:warehouseId - Lotes activos de un producto
router.get(
  "/lots/product/:productId/warehouse/:warehouseId",
  authMiddleware,
  hasPermission("inventory.lots.read"),
  validate(getActiveLotsByProductSchema),
  getActiveLotsByProduct
);

// GET /inventory/lots/:lotId/kardex - Kardex de un lote específico
router.get(
  "/lots/:lotId/kardex",
  authMiddleware,
  hasPermission("inventory.lots.read"),
  validate(getLotKardexSchema),
  getLotKardex
);

// GET /inventory/lots/:lotId - Detalle de un lote
router.get(
  "/lots/:lotId",
  authMiddleware,
  hasPermission("inventory.lots.read"),
  validate(getLotByIdSchema),
  getLotById
);

// ========== RUTAS EXISTENTES ==========

// GET /inventory/reports/value - Reporte de inventario valorizado
router.get(
  "/reports/value",
  authMiddleware,
  hasPermission("inventory.read"),
  validate(getInventoryValueReportSchema),
  getInventoryValueReport
);

// GET /inventory/reports/adjustments - Reporte de ajustes
router.get(
  "/reports/adjustments",
  authMiddleware,
  hasPermission("inventory.read"),
  validate(getAdjustmentsReportSchema),
  getAdjustmentsReport
);

// GET /inventory/movements/:productId - Kardex de un producto
router.get(
  "/movements/:productId",
  authMiddleware,
  hasPermission("inventory.read"),
  validate(getProductKardexSchema),
  getProductKardex
);

// POST /inventory/adjustments - Crear ajuste de inventario
router.post(
  "/adjustments",
  authMiddleware,
  hasPermission("inventory.adjustments.create"),
  validate(createAdjustmentSchema),
  createAdjustment
);

// GET /inventory/:warehouseId/:productId - Stock de un producto en un establecimiento
router.get(
  "/:warehouseId/:productId",
  authMiddleware,
  hasPermission("inventory.read"),
  validate(getStockByWarehouseAndProductSchema),
  getStockByWarehouseAndProduct
);

export default router;
