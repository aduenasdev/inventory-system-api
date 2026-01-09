import { Router } from "express";
import {
  createExchangeRateHandler,
  getExchangeRatesHandler,
  getExchangeRateHandler,
  getLatestExchangeRateHandler,
  updateExchangeRateHandler,
  deleteExchangeRateHandler,
} from "./exchange_rates.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createExchangeRateSchema, updateExchangeRateSchema } from "./exchange_rates.schemas";

const router = Router();

router.post("/", authMiddleware, hasPermission("exchange_rates.create"), validate(createExchangeRateSchema), createExchangeRateHandler);
router.get("/", authMiddleware, hasPermission("exchange_rates.read"), getExchangeRatesHandler);
router.get("/latest/:fromCurrencyId/:toCurrencyId", authMiddleware, hasPermission("exchange_rates.read"), getLatestExchangeRateHandler);
router.get("/:exchangeRateId", authMiddleware, hasPermission("exchange_rates.read"), getExchangeRateHandler);
router.put("/:exchangeRateId", authMiddleware, hasPermission("exchange_rates.update"), validate(updateExchangeRateSchema), updateExchangeRateHandler);
router.delete("/:exchangeRateId", authMiddleware, hasPermission("exchange_rates.delete"), deleteExchangeRateHandler);

export default router;
