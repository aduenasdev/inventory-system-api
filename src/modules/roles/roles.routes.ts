import { Router } from "express";
import {
  createRoleHandler,
  getRolesHandler,
  getRoleHandler,
  updateRoleHandler,
  addPermissionToRoleHandler,
  getPermissionsForRoleHandler,
  deleteRoleHandler,
  removePermissionFromRoleHandler,
  replaceRolePermissionsHandler,
} from "./roles.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { hasPermission } from "../../middlewares/authorization.middleware";
import { validate } from "../../middlewares/validate";
import { 
  createRoleSchema, 
  addPermissionToRoleSchema, 
  updateRoleSchema,
  replaceRolePermissionsSchema,
  removePermissionFromRoleSchema,
} from "./roles.schemas";

const router = Router();

router.get("/", authMiddleware, hasPermission("roles.read"), getRolesHandler);
router.get("/:roleId", authMiddleware, hasPermission("roles.read"), getRoleHandler);

router.post(
  "/",
  authMiddleware,
  hasPermission("roles.create"),
  validate(createRoleSchema),
  createRoleHandler
);

router.put(
  "/:roleId",
  authMiddleware,
  hasPermission("roles.update"),
  validate(updateRoleSchema),
  updateRoleHandler
);

router.delete("/:roleId", authMiddleware, hasPermission("roles.delete"), deleteRoleHandler);

router.get(
  "/:roleId/permissions",
  authMiddleware,
  hasPermission("roles.read"),
  getPermissionsForRoleHandler
);

router.post(
  "/:roleId/permissions",
  authMiddleware,
  hasPermission("roles.update"),
  validate(addPermissionToRoleSchema),
  addPermissionToRoleHandler
);

// PUT /roles/:roleId/permissions - Reemplazar TODOS los permisos de un rol
router.put(
  "/:roleId/permissions",
  authMiddleware,
  hasPermission("roles.update"),
  validate(replaceRolePermissionsSchema),
  replaceRolePermissionsHandler
);

// DELETE /roles/:roleId/permissions/:permissionId - Remover UN permiso de un rol
router.delete(
  "/:roleId/permissions/:permissionId",
  authMiddleware,
  hasPermission("roles.update"),
  validate(removePermissionFromRoleSchema),
  removePermissionFromRoleHandler
);

export default router;
