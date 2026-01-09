import { z } from "zod";

export const createWarehouseSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }),
    provincia: z.string().min(1, { message: "La provincia es requerida" }),
    municipio: z.string().min(1, { message: "El municipio es requerido" }),
    direccion: z.string().optional(),
    ubicacion: z.string().optional(),
  }),
});

export const updateWarehouseSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }).optional(),
    provincia: z.string().min(1, { message: "La provincia es requerida" }).optional(),
    municipio: z.string().min(1, { message: "El municipio es requerido" }).optional(),
    direccion: z.string().optional(),
    ubicacion: z.string().optional(),
  }),
  params: z.object({
    warehouseId: z.string(),
  }),
});

export const assignUserToWarehouseSchema = z.object({
  body: z.object({
    userId: z.number({ message: "El ID del usuario debe ser un número" }),
  }),
  params: z.object({
    warehouseId: z.string(),
  }),
});
