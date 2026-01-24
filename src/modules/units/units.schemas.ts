import { z } from "zod";

// Tipos válidos de unidades de medida
export const UNIT_TYPES = ['weight', 'volume', 'length', 'countable', 'package'] as const;
export type UnitType = typeof UNIT_TYPES[number];

export const createUnitSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }),
    shortName: z.string().min(1, { message: "El nombre corto es requerido" }),
    description: z.string().optional(),
    type: z.enum(UNIT_TYPES, { message: "Tipo de unidad inválido. Valores permitidos: weight, volume, length, countable, package" }),
  }),
});

export const updateUnitSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }).optional(),
    shortName: z.string().min(1, { message: "El nombre corto es requerido" }).optional(),
    description: z.string().optional(),
    type: z.enum(UNIT_TYPES, { message: "Tipo de unidad inválido. Valores permitidos: weight, volume, length, countable, package" }).optional(),
  }),
  params: z.object({
    unitId: z.string(),
  }),
});
