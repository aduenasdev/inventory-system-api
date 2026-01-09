import { z } from "zod";

export const createUnitSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }),
    shortName: z.string().min(1, { message: "El nombre corto es requerido" }),
    description: z.string().optional(),
    type: z.enum(["weight", "volume", "length", "count"], { message: "Tipo de unidad inválido" }),
  }),
});

export const updateUnitSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }).optional(),
    shortName: z.string().min(1, { message: "El nombre corto es requerido" }).optional(),
    description: z.string().optional(),
    type: z.enum(["weight", "volume", "length", "count"], { message: "Tipo de unidad inválido" }).optional(),
  }),
  params: z.object({
    unitId: z.string(),
  }),
});
