import { Router } from "express";
import {
  assignRoleToUserHandler,
  removeRoleFromUserHandler,
  createUserHandler,
  getUsersHandler,
  getUserHandler,
  updateUserHandler,
  disableUserHandler,
  enableUserHandler,
  deleteUserHandler,
} from "./users.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { isRole, hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { assignRoleToUserSchema, createUserSchema, updateUserSchema } from "./users.schemas";

const router = Router();

// Users CRUD (admin-only)
router.post("/", authMiddleware, hasPermission("users.create"), validate(createUserSchema), createUserHandler);
router.get("/", authMiddleware, hasPermission("users.read"), getUsersHandler);
router.get("/:userId", authMiddleware, hasPermission("users.read"), getUserHandler);
router.put("/:userId", authMiddleware, hasPermission("users.update"), validate(updateUserSchema), updateUserHandler);
router.put("/:userId/disable", authMiddleware, hasPermission("users.delete"), disableUserHandler);
router.put("/:userId/enable", authMiddleware, hasPermission("users.update"), enableUserHandler);
router.delete("/:userId", authMiddleware, hasPermission("users.delete"), deleteUserHandler);

// Role assignment endpoints remain
router.post(
  "/:userId/roles",
  authMiddleware,
  isRole("admin"),
  validate(assignRoleToUserSchema),
  assignRoleToUserHandler
);

router.delete(
  "/:userId/roles/:roleId",
  authMiddleware,
  isRole("admin"),
  removeRoleFromUserHandler
);

export default router;
