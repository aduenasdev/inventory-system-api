import { Router } from "express";
import {
  createAdjustmentType,
  getAllAdjustmentTypes,
  getAdjustmentTypeById,
  updateAdjustmentType,
  deleteAdjustmentType,
} from "./adjustment_types.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  createAdjustmentTypeSchema,
  updateAdjustmentTypeSchema,
  adjustmentTypeIdSchema,
} from "./adjustment_types.schemas";

const router = Router();

// Endpoint público - Solo requiere login (para selectores en formularios)
router.get("/active", authMiddleware, getAllAdjustmentTypes);

// CRUD con permisos
router.post(
  "/",
  authMiddleware,
  hasPermission("adjustment_types.create"),
  validate(createAdjustmentTypeSchema),
  createAdjustmentType
);

router.get(
  "/",
  authMiddleware,
  hasPermission("adjustment_types.read"),
  getAllAdjustmentTypes
);

router.get(
  "/:id",
  authMiddleware,
  hasPermission("adjustment_types.read"),
  validate(adjustmentTypeIdSchema),
  getAdjustmentTypeById
);

router.put(
  "/:id",
  authMiddleware,
  hasPermission("adjustment_types.update"),
  validate(updateAdjustmentTypeSchema),
  updateAdjustmentType
);

router.delete(
  "/:id",
  authMiddleware,
  hasPermission("adjustment_types.delete"),
  validate(adjustmentTypeIdSchema),
  deleteAdjustmentType
);

export default router;
