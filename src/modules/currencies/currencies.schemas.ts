import { z } from "zod";

export const createCurrencySchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }),
    code: z.string().min(2).max(10, { message: "El código debe tener entre 2 y 10 caracteres" }),
    symbol: z.string().min(1, { message: "El símbolo es requerido" }),
    decimalPlaces: z.number().int().min(0).max(6).default(2),
  }),
});

export const updateCurrencySchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "El nombre es requerido" }).optional(),
    code: z.string().min(2).max(10, { message: "El código debe tener entre 2 y 10 caracteres" }).optional(),
    symbol: z.string().min(1, { message: "El símbolo es requerido" }).optional(),
    decimalPlaces: z.number().int().min(0).max(6).optional(),
  }),
  params: z.object({
    currencyId: z.string(),
  }),
});
