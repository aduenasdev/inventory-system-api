import { Request, Response } from "express";
import { SalesService } from "./sales.service";

const salesService = new SalesService();

export const createSale = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await salesService.createSale({ ...req.body, userId });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllSales = async (req: Request, res: Response) => {
  try {
    const sales = await salesService.getAllSales();
    res.json(sales);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getSaleById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const sale = await salesService.getSaleById(id);
    res.json(sale);
  } catch (error: any) {
    res.status(404).json({ message: error.message });
  }
};

export const acceptSale = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user.id;
    const result = await salesService.acceptSale(id, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const cancelSale = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user.id;
    const { cancellationReason } = req.body;
    const result = await salesService.cancelSale(id, cancellationReason, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getDailySalesReport = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const sales = await salesService.getDailySalesReport(date as string);
    res.json(sales);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getCancelledSalesReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const sales = await salesService.getCancelledSalesReport(
      startDate as string,
      endDate as string
    );
    res.json(sales);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getSalesTotalsReport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate, targetCurrencyId } = req.query;
    const report = await salesService.getSalesTotalsReport(
      userId,
      startDate as string,
      endDate as string,
      Number(targetCurrencyId)
    );
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
