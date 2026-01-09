import { z } from "zod";

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
});

export const addPermissionToRoleSchema = z.object({
  body: z.object({
    permissionId: z.number(),
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
