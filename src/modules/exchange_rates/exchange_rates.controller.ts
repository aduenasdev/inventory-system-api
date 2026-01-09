import { Request, Response } from "express";
import {
  createExchangeRate,
  getAllExchangeRates,
  getExchangeRateById,
  getLatestExchangeRate,
  updateExchangeRate,
  deleteExchangeRate,
} from "./exchange_rates.service";

export async function createExchangeRateHandler(req: Request, res: Response) {
  try {
    const exchangeRate = await createExchangeRate(req.body);
    res.status(201).json(exchangeRate);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getExchangeRatesHandler(req: Request, res: Response) {
  try {
    const exchangeRates = await getAllExchangeRates();
    res.status(200).json(exchangeRates);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener tasas de cambio" });
  }
}

export async function getExchangeRateHandler(req: Request, res: Response) {
  try {
    const { exchangeRateId } = req.params;
    const exchangeRate = await getExchangeRateById(Number(exchangeRateId));
    if (!exchangeRate) return res.status(404).json({ message: "Tasa de cambio no encontrada" });
    res.status(200).json(exchangeRate);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener tasa de cambio" });
  }
}

export async function getLatestExchangeRateHandler(req: Request, res: Response) {
  try {
    const { fromCurrencyId, toCurrencyId } = req.params;
    const exchangeRate = await getLatestExchangeRate(Number(fromCurrencyId), Number(toCurrencyId));
    if (!exchangeRate) return res.status(404).json({ message: "No se encontró tasa de cambio para estas monedas" });
    res.status(200).json(exchangeRate);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener última tasa de cambio" });
  }
}

export async function updateExchangeRateHandler(req: Request, res: Response) {
  try {
    const { exchangeRateId } = req.params;
    const result = await updateExchangeRate(Number(exchangeRateId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function deleteExchangeRateHandler(req: Request, res: Response) {
  try {
    const { exchangeRateId } = req.params;
    const result = await deleteExchangeRate(Number(exchangeRateId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
