import { Router } from "express";
import {
  createCurrencyHandler,
  getCurrenciesHandler,
  getCurrencyHandler,
  updateCurrencyHandler,
  disableCurrencyHandler,
  enableCurrencyHandler,
  deleteCurrencyHandler,
} from "./currencies.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createCurrencySchema, updateCurrencySchema } from "./currencies.schemas";

const router = Router();

router.post("/", authMiddleware, hasPermission("currencies.create"), validate(createCurrencySchema), createCurrencyHandler);
router.get("/", authMiddleware, hasPermission("currencies.read"), getCurrenciesHandler);
router.get("/:currencyId", authMiddleware, hasPermission("currencies.read"), getCurrencyHandler);
router.put("/:currencyId", authMiddleware, hasPermission("currencies.update"), validate(updateCurrencySchema), updateCurrencyHandler);
router.put("/:currencyId/disable", authMiddleware, hasPermission("currencies.delete"), disableCurrencyHandler);
router.put("/:currencyId/enable", authMiddleware, hasPermission("currencies.update"), enableCurrencyHandler);
router.delete("/:currencyId", authMiddleware, hasPermission("currencies.delete"), deleteCurrencyHandler);

export default router;
