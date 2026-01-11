import { Router } from "express";
import { validate } from "../../middlewares/validate";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import {
  createSaleSchema,
  acceptSaleSchema,
  cancelSaleSchema,
  getDailySalesReportSchema,
  getCancelledSalesReportSchema,
  getSalesTotalsReportSchema,
} from "./sales.schemas";
import {
  createSale,
  getAllSales,
  getSaleById,
  acceptSale,
  cancelSale,
  getDailySalesReport,
  getCancelledSalesReport,
  getSalesTotalsReport,
} from "./sales.controller";

const router = Router();

router.post(
  "/",
  authMiddleware,
  hasPermission("sales.create"),
  validate(createSaleSchema),
  createSale
);

router.get(
  "/",
  authMiddleware,
  hasPermission("sales.read"),
  getAllSales
);

router.get(
  "/reports/daily",
  authMiddleware,
  hasPermission("sales.read"),
  validate(getDailySalesReportSchema),
  getDailySalesReport
);

router.get(
  "/reports/cancelled",
  authMiddleware,
  hasPermission("sales.read"),
  validate(getCancelledSalesReportSchema),
  getCancelledSalesReport
);

router.get(
  "/reports/totals",
  authMiddleware,
  hasPermission("sales.read"),
  validate(getSalesTotalsReportSchema),
  getSalesTotalsReport
);

router.get(
  "/:id",
  authMiddleware,
  hasPermission("sales.read"),
  getSaleById
);

router.post(
  "/:id/accept",
  authMiddleware,
  hasPermission("sales.accept"),
  validate(acceptSaleSchema),
  acceptSale
);

router.post(
  "/:id/cancel",
  authMiddleware,
  hasPermission("sales.cancel"),
  validate(cancelSaleSchema),
  cancelSale
);

export default router;
