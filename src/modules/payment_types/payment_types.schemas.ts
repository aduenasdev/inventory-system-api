import { z } from "zod";

export const createPaymentTypeSchema = z.object({
  body: z.object({
    type: z.string().min(1, { message: "El tipo es requerido" }),
    description: z.string().optional(),
  }),
});

export const updatePaymentTypeSchema = z.object({
  body: z.object({
    type: z.string().min(1, { message: "El tipo es requerido" }).optional(),
    description: z.string().optional(),
  }),
  params: z.object({
    paymentTypeId: z.string(),
  }),
});
