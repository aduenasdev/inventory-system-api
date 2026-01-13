import { Router } from "express";
import {
  createProductHandler,
  getProductsHandler,
  getProductHandler,
  getProductsByCategoryHandler,
  updateProductHandler,
  disableProductHandler,
  enableProductHandler,
  uploadProductImageHandler,
  deleteProductImageHandler,
} from "./products.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createProductSchema, updateProductSchema } from "./products.schemas";
import { upload } from "../../utils/imageStorage";

const router = Router();

router.post("/", authMiddleware, hasPermission("products.create"), validate(createProductSchema), createProductHandler);
router.get("/", authMiddleware, hasPermission("products.read"), getProductsHandler);
router.get("/category/:categoryId", authMiddleware, hasPermission("products.read"), getProductsByCategoryHandler);
router.get("/:productId", authMiddleware, hasPermission("products.read"), getProductHandler);
router.put("/:productId", authMiddleware, hasPermission("products.update"), validate(updateProductSchema), updateProductHandler);
router.put("/:productId/disable", authMiddleware, hasPermission("products.delete"), disableProductHandler);
router.put("/:productId/enable", authMiddleware, hasPermission("products.update"), enableProductHandler);

// Rutas de imágenes
router.post("/:productId/image", authMiddleware, hasPermission("products.update"), upload.single('image'), uploadProductImageHandler);
router.delete("/:productId/image", authMiddleware, hasPermission("products.update"), deleteProductImageHandler);

export default router;
