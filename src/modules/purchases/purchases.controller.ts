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
    const { startDate, endDate, warehouseId, status } = req.query as { 
      startDate: string; 
      endDate?: string;
      warehouseId?: string;
      status?: 'PENDING' | 'APPROVED' | 'CANCELLED';
    };
    
    const purchases = await purchasesService.getAllPurchases(
      userId, 
      userPermissions, 
      startDate, 
      endDate || startDate,  // Si no hay endDate, usar startDate (un solo día)
      warehouseId ? Number(warehouseId) : undefined,
      status
    );
    res.json(purchases);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPurchaseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (res.locals.user as any).id;
    const purchase = await purchasesService.getPurchaseById(Number(id), userId);
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
    const userId = (res.locals.user as any).id;
    const { startDate, endDate } = req.query;
    const report = await purchasesService.getCancelledPurchasesReport(
      userId,
      startDate as string,
      endDate as string
    );
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ========== ENDPOINTS AUXILIARES PARA FRONTEND ==========

// Obtener almacenes disponibles del usuario
export const getUserWarehouses = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const warehouses = await purchasesService.getUserWarehouses(userId);
    res.json(warehouses);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener productos disponibles para comprar
export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, categoryId } = req.query as { search?: string; categoryId?: string };
    const products = await purchasesService.getProducts(
      search,
      categoryId ? Number(categoryId) : undefined
    );
    res.json(products);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener monedas disponibles
export const getCurrencies = async (req: Request, res: Response) => {
  try {
    const currencies = await purchasesService.getCurrencies();
    res.json(currencies);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Verificar tasas de cambio disponibles
export const checkExchangeRates = async (req: Request, res: Response) => {
  try {
    const { currencyId, date } = req.query as { currencyId: string; date?: string };
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    const result = await purchasesService.checkExchangeRates(
      Number(currencyId),
      date,
      userPermissions
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener categorías
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await purchasesService.getCategories();
    res.json(categories);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener unidades de medida
export const getUnits = async (req: Request, res: Response) => {
  try {
    const units = await purchasesService.getUnits();
    res.json(units);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Reporte de compras
export const getPurchasesReport = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { startDate, endDate, warehouseId, limit } = req.query;

    const report = await purchasesService.getPurchasesReport(
      userId,
      startDate as string,
      endDate as string,
      warehouseId ? Number(warehouseId) : undefined,
      limit ? Number(limit) : 10
    );

    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
