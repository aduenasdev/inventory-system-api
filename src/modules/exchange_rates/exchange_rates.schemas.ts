import { z } from "zod";

export const getExchangeRatesSchema = z.object({
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Fecha inicio inválida, use formato YYYY-MM-DD" }),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Fecha fin inválida, use formato YYYY-MM-DD" }).optional(),
  }),
});

export const createExchangeRateSchema = z.object({
  body: z.object({
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

export const createBatchExchangeRatesSchema = z.object({
  body: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Fecha inválida, use formato YYYY-MM-DD" }),
    rates: z.array(
      z.object({
        toCurrencyId: z.number({ message: "El ID de moneda destino es requerido" }),
        rate: z.number().positive({ message: "La tasa debe ser un número positivo" }),
      })
    ).min(1, { message: "Debe proporcionar al menos una tasa" }),
  }),
});
