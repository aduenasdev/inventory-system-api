import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  getStockByWarehouseAndProduct,
  getStockByWarehouse,
  getProductKardex,
  createAdjustment,
  getInventoryValueReport,
  getAdjustmentsReport,
} from "./inventory.controller";
import {
  getStockByWarehouseAndProductSchema,
  getStockByWarehouseSchema,
  getProductKardexSchema,
  createAdjustmentSchema,
  getInventoryValueReportSchema,
  getAdjustmentsReportSchema,
} from "./inventory.schemas";

const router = Router();

// GET /inventory/:warehouseId/:productId - Stock de un producto en un almacén
router.get(
  "/:warehouseId/:productId",
  authMiddleware,
  hasPermission("inventory.read"),
  validate(getStockByWarehouseAndProductSchema),
  getStockByWarehouseAndProduct
);

// GET /inventory/:warehouseId - Stock completo de un almacén
router.get(
  "/:warehouseId",
  authMiddleware,
  hasPermission("inventory.read"),
  validate(getStockByWarehouseSchema),
  getStockByWarehouse
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

export default router;
