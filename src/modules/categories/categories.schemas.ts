import { z } from "zod";

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }),
    description: z.string().optional(),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }).optional(),
    description: z.string().optional(),
  }),
  params: z.object({
    categoryId: z.string(),
  }),
});
