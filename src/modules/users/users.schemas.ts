import { z } from "zod";

export const assignRoleToUserSchema = z.object({
  body: z.object({
    roleId: z.number(),
  }),
  params: z.object({
    userId: z.string(),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    roleIds: z.array(z.number()).min(1, "At least one role es requerido"),    warehouseIds: z.array(z.number()).optional(),  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
  }),
  params: z.object({
    userId: z.string(),
  }),
});
