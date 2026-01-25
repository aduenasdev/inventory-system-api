import { Router } from "express";
import {
  createExchangeRateHandler,
  getExchangeRatesHandler,
  getExchangeRateHandler,
  getLatestExchangeRateHandler,
  updateExchangeRateHandler,
  createBatchExchangeRatesHandler,
  getCurrentExchangeRatesHandler,
  getExchangeRatesChartHandler,
} from "./exchange_rates.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { getExchangeRatesSchema, createExchangeRateSchema, updateExchangeRateSchema, createBatchExchangeRatesSchema, getExchangeRatesChartSchema } from "./exchange_rates.schemas";

const router = Router();

// Public endpoints - Tasas de cambio (solo requiere login)
router.get("/current", authMiddleware, getCurrentExchangeRatesHandler);
router.get("/chart", authMiddleware, validate(getExchangeRatesChartSchema), getExchangeRatesChartHandler);
router.get("/", authMiddleware, validate(getExchangeRatesSchema), getExchangeRatesHandler);
router.get("/latest/:toCurrencyId", authMiddleware, getLatestExchangeRateHandler);
router.get("/:exchangeRateId", authMiddleware, getExchangeRateHandler);

// Admin endpoints - Crear y editar tasas
router.post("/batch", authMiddleware, hasPermission("exchange_rates.create"), validate(createBatchExchangeRatesSchema), createBatchExchangeRatesHandler);
router.post("/", authMiddleware, hasPermission("exchange_rates.create"), validate(createExchangeRateSchema), createExchangeRateHandler);
router.put("/:exchangeRateId", authMiddleware, hasPermission("exchange_rates.update"), validate(updateExchangeRateSchema), updateExchangeRateHandler);

export default router;
