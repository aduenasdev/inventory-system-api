import { Request, Response } from "express";
import { SalesService } from "./sales.service";

const salesService = new SalesService();

export const createSale = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    const sale = await salesService.createSale({
      ...req.body,
      userId,
      userPermissions,
    });

    res.status(201).json({
      message: sale.status === "APPROVED" 
        ? "Factura de venta creada y aprobada exitosamente. Lotes consumidos."
        : "Factura de venta creada exitosamente",
      data: sale,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getAllSales = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    const { startDate, endDate, warehouseId, status, isPaid } = req.query as { 
      startDate: string; 
      endDate?: string;
      warehouseId?: string;
      status?: 'PENDING' | 'APPROVED' | 'CANCELLED';
      isPaid?: string;
    };
    
    const sales = await salesService.getAllSales(
      userId, 
      userPermissions, 
      startDate, 
      endDate || startDate,  // Si no hay endDate, usar startDate (un solo día)
      warehouseId ? Number(warehouseId) : undefined,
      status,
      isPaid !== undefined ? isPaid === 'true' : undefined
    );
    res.json(sales);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSaleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sale = await salesService.getSaleById(Number(id));
    res.json(sale);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const acceptSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (res.locals.user as any).id;
    const result = await salesService.acceptSale(Number(id), userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const cancelSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;
    const userId = (res.locals.user as any).id;
    const result = await salesService.cancelSale(
      Number(id),
      cancellationReason,
      userId
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const markSaleAsPaid = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (res.locals.user as any).id;
    const result = await salesService.markSaleAsPaid(Number(id), userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getDailySalesReport = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const sales = await salesService.getDailySalesReport(date as string);
    res.json(sales);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
    res.status(400).json({ error: error.message });
  }
};

export const getSalesTotalsReport = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { startDate, endDate, targetCurrencyId } = req.query;
    const report = await salesService.getSalesTotalsReport(
      userId,
      startDate as string,
      endDate as string,
      Number(targetCurrencyId)
    );
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// ========== ENDPOINTS DE LOTES ==========

export const getSaleLotConsumptions = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const consumptions = await salesService.getSaleLotConsumptions(id);
    res.json(consumptions);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getSalesMarginReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, warehouseId } = req.query;
    const report = await salesService.getSalesMarginReport(
      startDate as string,
      endDate as string,
      warehouseId ? Number(warehouseId) : undefined
    );
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
