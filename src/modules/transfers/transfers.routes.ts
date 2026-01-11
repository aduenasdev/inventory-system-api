import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import {
  createTransferSchema,
  acceptTransferSchema,
  rejectTransferSchema,
  getTransfersByWarehouseSchema,
  getRejectedTransfersReportSchema,
} from "./transfers.schemas";
import {
  createTransfer,
  getAllTransfers,
  getTransferById,
  getTransfersByWarehouse,
  acceptTransfer,
  rejectTransfer,
  getRejectedTransfersReport,
} from "./transfers.controller";

const router = Router();

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
  getAllTransfers
);

router.get(
  "/by-warehouse",
  authMiddleware,
  hasPermission("transfers.read"),
  validate(getTransfersByWarehouseSchema),
  getTransfersByWarehouse
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

router.get(
  "/reports/rejected",
  authMiddleware,
  hasPermission("transfers.read"),
  validate(getRejectedTransfersReportSchema),
  getRejectedTransfersReport
);

export default router;
