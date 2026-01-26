import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import {
  createTransferSchema,
  acceptTransferSchema,
  rejectTransferSchema,
  cancelTransferSchema,
  getAllTransfersSchema,
  getAvailableProductsSchema,
  getRejectedTransfersReportSchema,
  getCancelledTransfersReportSchema,
} from "./transfers.schemas";
import {
  createTransfer,
  getAllTransfers,
  getTransferById,
  acceptTransfer,
  rejectTransfer,
  cancelTransfer,
  getRejectedTransfersReport,
  getCancelledTransfersReport,
  getOriginWarehouses,
  getDestinationWarehouses,
  getAvailableProducts,
  getCategories,
} from "./transfers.controller";

const router = Router();

// ========== ENDPOINTS AUXILIARES PARA FRONTEND ==========

// Obtener almacenes origen (solo los asignados al usuario)
router.get(
  "/warehouses/origin",
  authMiddleware,
  hasPermission("transfers.create"),
  getOriginWarehouses
);

// Obtener almacenes destino (todos los activos)
router.get(
  "/warehouses/destination",
  authMiddleware,
  hasPermission("transfers.create"),
  getDestinationWarehouses
);

// Obtener productos con stock disponible en un almacén
router.get(
  "/products/:warehouseId",
  authMiddleware,
  hasPermission("transfers.create"),
  validate(getAvailableProductsSchema),
  getAvailableProducts
);

// Obtener categorías activas
router.get(
  "/categories",
  authMiddleware,
  hasPermission("transfers.create"),
  getCategories
);

// ========== REPORTES (antes de /:id para evitar conflictos) ==========

router.get(
  "/reports/rejected",
  authMiddleware,
  hasPermission("transfers.read"),
  validate(getRejectedTransfersReportSchema),
  getRejectedTransfersReport
);

router.get(
  "/reports/cancelled",
  authMiddleware,
  hasPermission("transfers.read"),
  validate(getCancelledTransfersReportSchema),
  getCancelledTransfersReport
);

// ========== CRUD TRASLADOS ==========

router.post(
  "/",
  authMiddleware,
  hasPermission("transfers.create"),
  validate(createTransferSchema),
  createTransfer
);

router.get(
  "/",
  authMiddleware,
  hasPermission("transfers.read"),
  validate(getAllTransfersSchema),
  getAllTransfers
);

router.get(
  "/:id",
  authMiddleware,
  hasPermission("transfers.read"),
  getTransferById
);

router.post(
  "/:id/accept",
  authMiddleware,
  hasPermission("transfers.accept"),
  validate(acceptTransferSchema),
  acceptTransfer
);

router.post(
  "/:id/reject",
  authMiddleware,
  hasPermission("transfers.reject"),
  validate(rejectTransferSchema),
  rejectTransfer
);

router.post(
  "/:id/cancel",
  authMiddleware,
  hasPermission("transfers.cancel"),
  validate(cancelTransferSchema),
  cancelTransfer
);

export default router;
