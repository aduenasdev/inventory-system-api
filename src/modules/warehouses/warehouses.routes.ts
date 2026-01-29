import { Router } from "express";
import {
  createWarehouseHandler,
  getWarehousesHandler,
  getWarehouseHandler,
  updateWarehouseHandler,
  deleteWarehouseHandler,
  assignUserToWarehouseHandler,
  removeUserFromWarehouseHandler,
  getUsersInWarehouseHandler,
} from "./warehouses.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createWarehouseSchema, updateWarehouseSchema, assignUserToWarehouseSchema } from "./warehouses.schemas";

const router = Router();

// Public endpoint - Mis establecimientos activos (solo requiere login)
router.get("/active/me", authMiddleware, getWarehousesHandler);

// Warehouses CRUD
router.post("/", authMiddleware, hasPermission("warehouses.create"), validate(createWarehouseSchema), createWarehouseHandler);
router.get("/", authMiddleware, hasPermission("warehouses.read"), getWarehousesHandler);
router.get("/:warehouseId", authMiddleware, hasPermission("warehouses.read"), getWarehouseHandler);
router.put("/:warehouseId", authMiddleware, hasPermission("warehouses.update"), validate(updateWarehouseSchema), updateWarehouseHandler);
router.delete("/:warehouseId", authMiddleware, hasPermission("warehouses.delete"), deleteWarehouseHandler);

// User-Warehouse associations
router.post(
  "/:warehouseId/users",
  authMiddleware,
  hasPermission("users.warehouses.associate"),
  validate(assignUserToWarehouseSchema),
  assignUserToWarehouseHandler
);

router.delete(
  "/:warehouseId/users/:userId",
  authMiddleware,
  hasPermission("users.warehouses.associate"),
  removeUserFromWarehouseHandler
);

router.get(
  "/:warehouseId/users",
  authMiddleware,
  hasPermission("warehouses.read"),
  getUsersInWarehouseHandler
);

export default router;
