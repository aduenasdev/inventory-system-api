import { z } from "zod";

export const createAdjustmentTypeSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre es requerido"),
    description: z.string().optional(),
    affectsPositively: z.boolean(),
  }),
});

export const updateAdjustmentTypeSchema = z.object({
  body: z.object({
    name: z.string().min(1, "El nombre es requerido").optional(),
    description: z.string().optional(),
    affectsPositively: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string(),
  }),
});

export const adjustmentTypeIdSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});
