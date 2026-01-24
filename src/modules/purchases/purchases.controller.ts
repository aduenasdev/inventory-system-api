import { Request, Response } from "express";
import { PurchasesService } from "./purchases.service";

const purchasesService = new PurchasesService();

export const createPurchase = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    const purchase = await purchasesService.createPurchase({
      ...req.body,
      userId,
      userPermissions,
    });

    res.status(201).json({
      message: purchase.status === "APPROVED" 
        ? "Factura de compra creada y aprobada exitosamente. Lotes creados."
        : "Factura de compra creada exitosamente",
      data: purchase,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getAllPurchases = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    const { startDate, endDate } = req.query as { startDate: string; endDate?: string };
    
    const purchases = await purchasesService.getAllPurchases(
      userId, 
      userPermissions, 
      startDate, 
      endDate || startDate  // Si no hay endDate, usar startDate (un solo día)
    );
    res.json(purchases);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPurchaseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const purchase = await purchasesService.getPurchaseById(Number(id));
    res.json(purchase);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const acceptPurchase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (res.locals.user as any).id;
    const result = await purchasesService.acceptPurchase(Number(id), userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const cancelPurchase = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;
    const userId = (res.locals.user as any).id;
    const result = await purchasesService.cancelPurchase(
      Number(id),
      cancellationReason,
      userId
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getCancelledPurchasesReport = async (
  req: Request,
  res: Response
) => {
  try {
    const { startDate, endDate } = req.query;
    const report = await purchasesService.getCancelledPurchasesReport(
      startDate as string,
      endDate as string
    );
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
