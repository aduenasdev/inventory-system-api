import { z } from "zod";

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string({ message: "El nombre es requerido" }),
    description: z.string().optional(),
  }),
});

export const addPermissionToRoleSchema = z.object({
  body: z.object({
    permissionId: z.number({ message: "El ID del permiso debe ser un número" }),
  }),
  params: z.object({
    roleId: z.string(),
  }),
});

export const updateRoleSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
  }),
  params: z.object({
    roleId: z.string(),
  }),
});

export const replaceRolePermissionsSchema = z.object({
  body: z.object({
    permissionIds: z.array(z.number({ message: "Cada ID de permiso debe ser un número" })),
  }),
  params: z.object({
    roleId: z.string(),
  }),
});

export const removePermissionFromRoleSchema = z.object({
  params: z.object({
    roleId: z.string(),
    permissionId: z.string(),
  }),
});
