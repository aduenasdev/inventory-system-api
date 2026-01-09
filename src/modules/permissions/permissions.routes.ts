import { Router } from "express";
import { getPermissionsHandler } from "./permissions.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = Router();

router.get("/", authMiddleware, getPermissionsHandler);

export default router;
