import { Request, Response } from "express";
import {
  createCurrency,
  getAllCurrencies,
  getCurrencyById,
  updateCurrency,
  disableCurrency,
  enableCurrency,
  deleteCurrency,
} from "./currencies.service";

export async function createCurrencyHandler(req: Request, res: Response) {
  try {
    const currency = await createCurrency(req.body);
    res.status(201).json(currency);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getCurrenciesHandler(req: Request, res: Response) {
  try {
    // Si la ruta es /active, forzar active=true
    if (req.path === '/active') {
      const currencies = await getAllCurrencies(true);
      return res.status(200).json(currencies);
    }
    
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    const currencies = await getAllCurrencies(active);
    res.status(200).json(currencies);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener monedas" });
  }
}

export async function getCurrencyHandler(req: Request, res: Response) {
  try {
    const { currencyId } = req.params;
    const currency = await getCurrencyById(Number(currencyId));
    if (!currency) return res.status(404).json({ message: "Moneda no encontrada" });
    res.status(200).json(currency);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener moneda" });
  }
}

export async function updateCurrencyHandler(req: Request, res: Response) {
  try {
    const { currencyId } = req.params;
    const result = await updateCurrency(Number(currencyId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function disableCurrencyHandler(req: Request, res: Response) {
  try {
    const { currencyId } = req.params;
    const result = await disableCurrency(Number(currencyId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function enableCurrencyHandler(req: Request, res: Response) {
  try {
    const { currencyId } = req.params;
    const result = await enableCurrency(Number(currencyId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function deleteCurrencyHandler(req: Request, res: Response) {
  try {
    const { currencyId } = req.params;
    const result = await deleteCurrency(Number(currencyId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
