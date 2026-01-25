import { Request, Response } from "express";
import {
  createExchangeRate,
  getAllExchangeRates,
  getExchangeRateById,
  getLatestExchangeRate,
  updateExchangeRate,
  createBatchExchangeRates,
  getCurrentExchangeRates,
  getExchangeRatesForChart,
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
    const { startDate, endDate } = req.query;
    const exchangeRates = await getAllExchangeRates(startDate as string, endDate as string);
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
    const { toCurrencyId } = req.params;
    const exchangeRate = await getLatestExchangeRate(Number(toCurrencyId));
    if (!exchangeRate) return res.status(404).json({ message: "No se encontró tasa de cambio de CUP a esta moneda" });
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

export async function createBatchExchangeRatesHandler(req: Request, res: Response) {
  try {
    console.log('📥 Batch request received:', JSON.stringify(req.body, null, 2));
    const results = await createBatchExchangeRates(req.body);
    console.log('✅ Batch created successfully:', results.length, 'rates');
    res.status(201).json(results);
  } catch (error: any) {
    console.error('❌ Batch error:', error.message);
    console.error('❌ Stack:', error.stack);
    res.status(400).json({ message: error.message });
  }
}

export async function getCurrentExchangeRatesHandler(req: Request, res: Response) {
  try {
    const rates = await getCurrentExchangeRates();
    res.status(200).json(rates);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener tasas vigentes" });
  }
}

export async function getExchangeRatesChartHandler(req: Request, res: Response) {
  try {
    const { startDate, endDate } = req.query;
    const chartData = await getExchangeRatesForChart(startDate as string, endDate as string);
    res.status(200).json(chartData);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener datos para gráfica" });
  }
}
