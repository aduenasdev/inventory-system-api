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
  }),
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
