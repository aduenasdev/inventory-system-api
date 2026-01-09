import { Router } from "express";
import {
  loginHandler,
  refreshTokenHandler,
  meHandler,
} from "./auth.controller";
import { validate } from "../../middlewares/validate";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { loginUserSchema, refreshTokenSchema } from "./auth.schemas";

const router = Router();

router.post("/login", validate(loginUserSchema), loginHandler);
router.post("/refresh", validate(refreshTokenSchema), refreshTokenHandler);
router.get("/me", authMiddleware, meHandler);

export default router;
