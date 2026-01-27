import { Router } from "express";
import {
  getWarehouses,
  getAdjustmentTypes,
  getProductsWithStock,
  getAllProducts,
  getCurrencies,
  createAdjustment,
  getAllAdjustments,
  getAdjustmentById,
  acceptAdjustment,
  cancelAdjustment,
} from "./adjustments.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  createAdjustmentSchema,
  cancelAdjustmentSchema,
  adjustmentIdSchema,
  getAdjustmentsSchema,
} from "./adjustments.schemas";

const router = Router();

// ========== ENDPOINTS AUXILIARES (solo requieren login) ==========
router.get("/warehouses", authMiddleware, getWarehouses);
router.get("/adjustment-types", authMiddleware, getAdjustmentTypes);
router.get("/products-with-stock/:warehouseId", authMiddleware, getProductsWithStock);
router.get("/products", authMiddleware, getAllProducts);
router.get("/currencies", authMiddleware, getCurrencies);

// ========== CRUD DE AJUSTES ==========

// Crear ajuste
router.post(
  "/",
  authMiddleware,
  hasPermission("adjustments.create"),
  validate(createAdjustmentSchema),
  createAdjustment
);

// Listar ajustes
router.get(
  "/",
  authMiddleware,
  hasPermission("adjustments.read"),
  validate(getAdjustmentsSchema),
  getAllAdjustments
);

// Obtener ajuste por ID
router.get(
  "/:id",
  authMiddleware,
  hasPermission("adjustments.read"),
  validate(adjustmentIdSchema),
  getAdjustmentById
);

// Aprobar ajuste
router.put(
  "/:id/accept",
  authMiddleware,
  hasPermission("adjustments.accept"),
  validate(adjustmentIdSchema),
  acceptAdjustment
);

// Cancelar ajuste (solo el creador puede cancelar)
router.put(
  "/:id/cancel",
  authMiddleware,
  hasPermission("adjustments.cancel"),
  validate(cancelAdjustmentSchema),
  cancelAdjustment
);

export default router;
