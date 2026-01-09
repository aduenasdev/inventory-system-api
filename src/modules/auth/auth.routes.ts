import { Router } from "express";
import {
  loginHandler,
  refreshTokenHandler,
  meHandler,
  changePasswordHandler,
} from "./auth.controller";
import { validate } from "../../middlewares/validate";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { loginUserSchema, refreshTokenSchema, changePasswordSchema } from "./auth.schemas";

const router = Router();

router.post("/login", validate(loginUserSchema), loginHandler);
router.post("/refresh", validate(refreshTokenSchema), refreshTokenHandler);
router.get("/me", authMiddleware, meHandler);
router.put("/change-password", authMiddleware, validate(changePasswordSchema), changePasswordHandler);

export default router;
