import { Router } from "express";
import {
  createUnitHandler,
  getUnitsHandler,
  getUnitHandler,
  updateUnitHandler,
  disableUnitHandler,
  enableUnitHandler,
} from "./units.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createUnitSchema, updateUnitSchema } from "./units.schemas";

const router = Router();

// Public endpoint - Unidades activas (solo requiere login)
router.get("/active", authMiddleware, getUnitsHandler);

router.post("/", authMiddleware, hasPermission("units.create"), validate(createUnitSchema), createUnitHandler);
router.get("/", authMiddleware, hasPermission("units.read"), getUnitsHandler);
router.get("/:unitId", authMiddleware, hasPermission("units.read"), getUnitHandler);
router.put("/:unitId", authMiddleware, hasPermission("units.update"), validate(updateUnitSchema), updateUnitHandler);
router.put("/:unitId/disable", authMiddleware, hasPermission("units.delete"), disableUnitHandler);
router.put("/:unitId/enable", authMiddleware, hasPermission("units.update"), enableUnitHandler);

export default router;
