import { Request, Response } from "express";
import {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  addPermissionToRole,
  getPermissionsForRole,
  deleteRole,
  removePermissionFromRole,
  replaceRolePermissions,
} from "./roles.service";

export async function createRoleHandler(req: Request, res: Response) {
  try {
    const newRole = await createRole(req.body);
    res.status(201).json(newRole);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getRolesHandler(req: Request, res: Response) {
  try {
    const roles = await getAllRoles();
    res.status(200).json(roles);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching roles" });
  }
}

export async function getRoleHandler(req: Request, res: Response) {
  try {
    const { roleId } = req.params;
    const role = await getRoleById(Number(roleId));
    if (!role) return res.status(404).json({ message: "Role not found" });
    res.status(200).json(role);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching role" });
  }
}

export async function updateRoleHandler(req: Request, res: Response) {
  try {
    const { roleId } = req.params;
    const result = await updateRole(Number(roleId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function addPermissionToRoleHandler(req: Request, res: Response) {
  try {
    const { roleId } = req.params;
    const { permissionId } = req.body;
    const result = await addPermissionToRole(Number(roleId), permissionId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getPermissionsForRoleHandler(req: Request, res: Response) {
  try {
    const { roleId } = req.params;
    const permissions = await getPermissionsForRole(Number(roleId));
    res.status(200).json(permissions);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching permissions for role" });
  }
}

export async function deleteRoleHandler(req: Request, res: Response) {
  try {
    const { roleId } = req.params;
    const result = await deleteRole(Number(roleId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function removePermissionFromRoleHandler(req: Request, res: Response) {
  try {
    const { roleId, permissionId } = req.params;
    const result = await removePermissionFromRole(Number(roleId), Number(permissionId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function replaceRolePermissionsHandler(req: Request, res: Response) {
  try {
    const { roleId } = req.params;
    const { permissionIds } = req.body;
    const result = await replaceRolePermissions(Number(roleId), permissionIds);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
