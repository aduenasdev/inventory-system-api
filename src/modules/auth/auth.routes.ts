import { Router } from "express";
import {
    
  registerHandler,
  loginHandler,
  refreshTokenHandler,
  meHandler,
} from "./auth.controller";
import { validate } from "../../middlewares/validate";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { registerUserSchema, loginUserSchema } from "./auth.schemas";

const router = Router();

router.post("/register", validate(registerUserSchema), registerHandler);
router.post("/login", validate(loginUserSchema), loginHandler);
router.post("/refresh", refreshTokenHandler);
router.get("/me", authMiddleware, meHandler);

export default router;
