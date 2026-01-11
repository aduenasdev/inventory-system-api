import { Router } from "express";
import {
  createPaymentTypeHandler,
  getPaymentTypesHandler,
  getPaymentTypeHandler,
  updatePaymentTypeHandler,
  disablePaymentTypeHandler,
  enablePaymentTypeHandler,
  deletePaymentTypeHandler,
} from "./payment_types.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createPaymentTypeSchema, updatePaymentTypeSchema } from "./payment_types.schemas";

const router = Router();

router.post("/", authMiddleware, hasPermission("payment_types.create"), validate(createPaymentTypeSchema), createPaymentTypeHandler);
router.get("/", authMiddleware, hasPermission("payment_types.read"), getPaymentTypesHandler);
router.get("/:paymentTypeId", authMiddleware, hasPermission("payment_types.read"), getPaymentTypeHandler);
router.put("/:paymentTypeId", authMiddleware, hasPermission("payment_types.update"), validate(updatePaymentTypeSchema), updatePaymentTypeHandler);
router.put("/:paymentTypeId/disable", authMiddleware, hasPermission("payment_types.delete"), disablePaymentTypeHandler);
router.put("/:paymentTypeId/enable", authMiddleware, hasPermission("payment_types.update"), enablePaymentTypeHandler);
router.delete("/:paymentTypeId", authMiddleware, hasPermission("payment_types.delete"), deletePaymentTypeHandler);

export default router;
