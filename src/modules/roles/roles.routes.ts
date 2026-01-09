import { Router } from "express";
import {
  createRoleHandler,
  getRolesHandler,
  getRoleHandler,
  updateRoleHandler,
  addPermissionToRoleHandler,
  getPermissionsForRoleHandler,
  deleteRoleHandler,
} from "./roles.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { isRole } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { createRoleSchema, addPermissionToRoleSchema, updateRoleSchema } from "./roles.schemas";

const router = Router();

router.get("/", authMiddleware, getRolesHandler);
router.get("/:roleId", authMiddleware, getRoleHandler);

router.post(
  "/",
  authMiddleware,
  isRole("admin"),
  validate(createRoleSchema),
  createRoleHandler
);

router.put(
  "/:roleId",
  authMiddleware,
  isRole("admin"),
  validate(updateRoleSchema),
  updateRoleHandler
);

router.delete("/:roleId", authMiddleware, isRole("admin"), deleteRoleHandler);

router.get(
  "/:roleId/permissions",
  authMiddleware,
  getPermissionsForRoleHandler
);

router.post(
  "/:roleId/permissions",
  authMiddleware,
  isRole("admin"),
  validate(addPermissionToRoleSchema),
  addPermissionToRoleHandler
);

export default router;
