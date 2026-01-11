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
} from "./purchases.controller";
import {
  createPurchaseSchema,
  getPurchaseByIdSchema,
  acceptPurchaseSchema,
  cancelPurchaseSchema,
  getCancelledPurchasesReportSchema,
} from "./purchases.schemas";

const router = Router();

// GET /purchases - Listar todas las compras
router.get(
  "/",
  authMiddleware,
  hasPermission("purchases.read"),
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
