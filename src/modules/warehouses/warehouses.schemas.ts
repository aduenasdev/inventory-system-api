import { z } from "zod";

export const createWarehouseSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name es requerido"),
    provincia: z.string().min(1, "Provincia es requerido"),
    municipio: z.string().min(1, "Municipio es requerido"),
    direccion: z.string().optional(),
    ubicacion: z.string().optional(),
  }),
});

export const updateWarehouseSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    provincia: z.string().min(1).optional(),
    municipio: z.string().min(1).optional(),
    direccion: z.string().optional(),
    ubicacion: z.string().optional(),
  }),
  params: z.object({
    warehouseId: z.string(),
  }),
});

export const assignUserToWarehouseSchema = z.object({
  body: z.object({
    userId: z.number(),
  }),
  params: z.object({
    warehouseId: z.string(),
  }),
});
