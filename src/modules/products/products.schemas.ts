import { z } from "zod";

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }),
    code: z.string().min(1, { message: "El código es requerido" }),
    description: z.string().optional(),
    costPrice: z.number().nonnegative({ message: "El precio de costo debe ser no negativo" }).optional(),
    salePrice: z.number().nonnegative({ message: "El precio de venta debe ser no negativo" }).optional(),
    currencyId: z.number({ message: "El ID de moneda es requerido" }),
    unitId: z.number({ message: "El ID de unidad es requerido" }),
    categoryId: z.number({ message: "El ID de categoría es requerido" }),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }).optional(),
    code: z.string().min(1, { message: "El código es requerido" }).optional(),
    description: z.string().optional(),
    costPrice: z.number().nonnegative({ message: "El precio de costo debe ser no negativo" }).optional(),
    salePrice: z.number().nonnegative({ message: "El precio de venta debe ser no negativo" }).optional(),
    currencyId: z.number({ message: "El ID de moneda es requerido" }).optional(),
    unitId: z.number({ message: "El ID de unidad es requerido" }).optional(),
    categoryId: z.number({ message: "El ID de categoría es requerido" }).optional(),
  }),
  params: z.object({
    productId: z.string(),
  }),
});
