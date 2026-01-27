import { Router } from "express";
import {
  createExpenseTypeHandler,
  getExpenseTypesHandler,
  getExpenseTypeHandler,
  updateExpenseTypeHandler,
  disableExpenseTypeHandler,
  enableExpenseTypeHandler,
  deleteExpenseTypeHandler,
} from "./expense_types.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createExpenseTypeSchema, updateExpenseTypeSchema, expenseTypeIdSchema } from "./expense_types.schemas";

const router = Router();

// Endpoint público - Tipos de gasto activos (solo requiere login, para selectores)
router.get("/active", authMiddleware, getExpenseTypesHandler);

// CRUD con permisos
router.post(
  "/",
  authMiddleware,
  hasPermission("expense_types.create"),
  validate(createExpenseTypeSchema),
  createExpenseTypeHandler
);

router.get(
  "/",
  authMiddleware,
  hasPermission("expense_types.read"),
  getExpenseTypesHandler
);

router.get(
  "/:id",
  authMiddleware,
  hasPermission("expense_types.read"),
  validate(expenseTypeIdSchema),
  getExpenseTypeHandler
);

router.put(
  "/:id",
  authMiddleware,
  hasPermission("expense_types.update"),
  validate(updateExpenseTypeSchema),
  updateExpenseTypeHandler
);

router.put(
  "/:id/disable",
  authMiddleware,
  hasPermission("expense_types.delete"),
  validate(expenseTypeIdSchema),
  disableExpenseTypeHandler
);

router.put(
  "/:id/enable",
  authMiddleware,
  hasPermission("expense_types.update"),
  validate(expenseTypeIdSchema),
  enableExpenseTypeHandler
);

router.delete(
  "/:id",
  authMiddleware,
  hasPermission("expense_types.delete"),
  validate(expenseTypeIdSchema),
  deleteExpenseTypeHandler
);

export default router;
