import { Router } from "express";
import {
  createProductHandler,
  getProductsHandler,
  getProductHandler,
  getProductsByCategoryHandler,
  updateProductHandler,
  uploadProductImageHandler,
  deleteProductImageHandler,
  getProductImageHandler,
  getProductThumbnailHandler,
} from "./products.controller";

// Miniatura del producto

import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import {
  createProductSchema,
  updateProductSchema,
  getProductsQuerySchema,
} from "./products.schemas";
import { upload } from "../../utils/imageStorage";

const router = Router();

// Rutas de imágenes públicas (DEBEN estar antes de /:productId para evitar conflictos)
router.get("/image/:productId.webp", getProductImageHandler);
router.get("/thumb/:productId.webp", getProductThumbnailHandler);

router.post(
  "/",
  authMiddleware,
  hasPermission("products.create"),
  validate(createProductSchema),
  createProductHandler
);
router.get(
  "/",
  authMiddleware,
  hasPermission("products.read"),
  validate(getProductsQuerySchema),
  getProductsHandler
);
router.get(
  "/category/:categoryId",
  authMiddleware,
  hasPermission("products.read"),
  getProductsByCategoryHandler
);
router.get(
  "/:productId",
  authMiddleware,
  hasPermission("products.read"),
  getProductHandler
);
router.put(
  "/:productId",
  authMiddleware,
  hasPermission("products.update"),
  validate(updateProductSchema),
  updateProductHandler
);

// Rutas de imágenes
router.post(
  "/:productId/image",
  authMiddleware,
  hasPermission("products.update"),
  upload.single("image"),
  uploadProductImageHandler
);
router.delete(
  "/:productId/image",
  authMiddleware,
  hasPermission("products.update"),
  deleteProductImageHandler
);

export default router;
