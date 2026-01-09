import { Router } from "express";
import {
  createCategoryHandler,
  getCategoriesHandler,
  getCategoryHandler,
  updateCategoryHandler,
  disableCategoryHandler,
  enableCategoryHandler,
} from "./categories.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createCategorySchema, updateCategorySchema } from "./categories.schemas";

const router = Router();

router.post("/", authMiddleware, hasPermission("categories.create"), validate(createCategorySchema), createCategoryHandler);
router.get("/", authMiddleware, hasPermission("categories.read"), getCategoriesHandler);
router.get("/:categoryId", authMiddleware, hasPermission("categories.read"), getCategoryHandler);
router.put("/:categoryId", authMiddleware, hasPermission("categories.update"), validate(updateCategorySchema), updateCategoryHandler);
router.put("/:categoryId/disable", authMiddleware, hasPermission("categories.delete"), disableCategoryHandler);
router.put("/:categoryId/enable", authMiddleware, hasPermission("categories.update"), enableCategoryHandler);

export default router;
