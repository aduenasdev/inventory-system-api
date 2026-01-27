import { Router } from "express";
import {
  getWarehouses,
  getExpenseTypes,
  getCurrencies,
  createExpense,
  getAllExpenses,
  getExpenseById,
  acceptExpense,
  cancelExpense,
  getExpensesSummary,
  getExpensesReport,
} from "./expenses.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  createExpenseSchema,
  cancelExpenseSchema,
  expenseIdSchema,
  getExpensesSchema,
  getExpensesSummarySchema,
  getExpensesReportSchema,
} from "./expenses.schemas";

const router = Router();

// ========== ENDPOINTS AUXILIARES (solo requieren login) ==========
router.get("/warehouses", authMiddleware, getWarehouses);
router.get("/expense-types", authMiddleware, getExpenseTypes);
router.get("/currencies", authMiddleware, getCurrencies);

// ========== RESUMEN ==========
router.get(
  "/summary",
  authMiddleware,
  hasPermission("expenses.read"),
  validate(getExpensesSummarySchema),
  getExpensesSummary
);

// ========== REPORTE DETALLADO ==========
router.get(
  "/report",
  authMiddleware,
  hasPermission("expenses.read"),
  validate(getExpensesReportSchema),
  getExpensesReport
);

// ========== CRUD DE GASTOS ==========

// Crear gasto
router.post(
  "/",
  authMiddleware,
  hasPermission("expenses.create"),
  validate(createExpenseSchema),
  createExpense
);

// Listar gastos
router.get(
  "/",
  authMiddleware,
  hasPermission("expenses.read"),
  validate(getExpensesSchema),
  getAllExpenses
);

// Obtener gasto por ID
router.get(
  "/:id",
  authMiddleware,
  hasPermission("expenses.read"),
  validate(expenseIdSchema),
  getExpenseById
);

// Aprobar gasto
router.put(
  "/:id/accept",
  authMiddleware,
  hasPermission("expenses.accept"),
  validate(expenseIdSchema),
  acceptExpense
);

// Cancelar gasto (solo el creador puede cancelar)
router.put(
  "/:id/cancel",
  authMiddleware,
  hasPermission("expenses.cancel"),
  validate(cancelExpenseSchema),
  cancelExpense
);

export default router;
