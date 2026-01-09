import { z } from "zod";

export const createExchangeRateSchema = z.object({
  body: z.object({
    fromCurrencyId: z.number({ message: "El ID de moneda origen es requerido" }),
    toCurrencyId: z.number({ message: "El ID de moneda destino es requerido" }),
    rate: z.number().positive({ message: "La tasa debe ser un número positivo" }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Fecha inválida, use formato YYYY-MM-DD" }),
  }),
});

export const updateExchangeRateSchema = z.object({
  body: z.object({
    rate: z.number().positive({ message: "La tasa debe ser un número positivo" }).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Fecha inválida, use formato YYYY-MM-DD" }).optional(),
  }),
  params: z.object({
    exchangeRateId: z.string(),
  }),
});
