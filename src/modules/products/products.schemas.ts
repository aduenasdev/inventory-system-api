import { z } from "zod";

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }),
    code: z.string().optional().transform(val => val === "" ? undefined : val), // String vacío se trata como no enviado
    description: z.string().optional(),
    salePrice: z.number().nonnegative({ message: "El precio de venta debe ser no negativo" }).optional(),
    currencyId: z.number({ message: "El ID de moneda es requerido" }),
    unitId: z.number({ message: "El ID de unidad es requerido" }),
    categoryId: z.number().optional(),
  }),
});

export const getProductsQuerySchema = z.object({
  query: z.object({
    name: z.string().optional(), // Búsqueda por nombre (LIKE)
    categoryId: z.string().regex(/^\d+$/, { message: "categoryId debe ser un número positivo" }).optional(),
    page: z.string().regex(/^\d+$/, { message: "page debe ser un número positivo" }).optional(),
    pageSize: z.string().regex(/^\d+$/, { message: "pageSize debe ser un número positivo" }).optional(),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }).optional(),
    code: z.string().min(1, { message: "El código es requerido" }).optional(),
    description: z.string().optional(),
    salePrice: z.number().nonnegative({ message: "El precio de venta debe ser no negativo" }).optional(),
    currencyId: z.number({ message: "El ID de moneda es requerido" }).optional(),
    unitId: z.number({ message: "El ID de unidad es requerido" }).optional(),
    categoryId: z.number().optional(),
  }),
  params: z.object({
    productId: z.string(),
  }),
});

export const deleteProductSchema = z.object({
  params: z.object({
    productId: z.string().regex(/^\d+$/, { message: "productId debe ser un número positivo" }),
  }),
});
