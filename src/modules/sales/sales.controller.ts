import { Request, Response } from "express";
import { SalesService } from "./sales.service";

const salesService = new SalesService();

export const createSale = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    const result = await salesService.createSale({
      ...req.body,
      userId,
      userPermissions,
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getAllSales = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    const { startDate, endDate, warehouseId, status, isPaid, page, limit } = req.query as { 
      startDate: string; 
      endDate?: string;
      warehouseId?: string;
      status?: 'PENDING' | 'APPROVED' | 'CANCELLED';
      isPaid?: string;
      page?: string;
      limit?: string;
    };
    
    const result = await salesService.getAllSales(
      userId, 
      userPermissions, 
      startDate, 
      endDate || startDate,  // Si no hay endDate, usar startDate (un solo día)
      warehouseId ? Number(warehouseId) : undefined,
      status,
      isPaid !== undefined ? isPaid === 'true' : undefined,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getSaleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saleId = Number(id);
    if (isNaN(saleId) || saleId <= 0) {
      return res.status(400).json({ error: "ID de venta inválido" });
    }
    const sale = await salesService.getSaleById(saleId);
    res.json(sale);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const acceptSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saleId = Number(id);
    if (isNaN(saleId) || saleId <= 0) {
      return res.status(400).json({ error: "ID de venta inválido" });
    }
    const userId = (res.locals.user as any).id;
    const result = await salesService.acceptSale(saleId, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const cancelSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saleId = Number(id);
    if (isNaN(saleId) || saleId <= 0) {
      return res.status(400).json({ error: "ID de venta inválido" });
    }
    const { cancellationReason } = req.body;
    const userId = (res.locals.user as any).id;
    const result = await salesService.cancelSale(
      saleId,
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
    const saleId = Number(id);
    if (isNaN(saleId) || saleId <= 0) {
      return res.status(400).json({ error: "ID de venta inválido" });
    }
    const userId = (res.locals.user as any).id;
    const result = await salesService.markSaleAsPaid(saleId, userId);
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

// ========== ENDPOINTS PARA CREAR VENTAS ==========

// Obtener productos disponibles para vender en un establecimiento
export const getAvailableProducts = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const warehouseId = parseInt(req.params.warehouseId);
    const { search, categoryId } = req.query as { search?: string; categoryId?: string };
    
    const result = await salesService.getAvailableProducts(
      userId,
      warehouseId,
      search,
      categoryId ? Number(categoryId) : undefined
    );
    res.json(result);
  } catch (error: any) {
    const status = error.name === 'ForbiddenError' ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
};

// Obtener establecimientos disponibles del usuario
export const getUserWarehouses = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const warehouses = await salesService.getUserWarehouses(userId);
    res.json(warehouses);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Verificar tasas de cambio disponibles
export const checkExchangeRates = async (req: Request, res: Response) => {
  try {
    const { currencyId, date } = req.query as { currencyId: string; date?: string };
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    const result = await salesService.checkExchangeRates(
      Number(currencyId),
      date,
      userPermissions
    );
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener monedas activas
export const getCurrencies = async (_req: Request, res: Response) => {
  try {
    const currencies = await salesService.getCurrencies();
    res.json(currencies);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener tipos de pago activos
export const getPaymentTypes = async (_req: Request, res: Response) => {
  try {
    const paymentTypes = await salesService.getPaymentTypes();
    res.json(paymentTypes);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener categorías activas
export const getCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await salesService.getCategories();
    res.json(categories);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Obtener unidades activas
export const getUnits = async (_req: Request, res: Response) => {
  try {
    const units = await salesService.getUnits();
    res.json(units);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// ========== REPORTE AVANZADO DE VENTAS ==========
// Retorna ventas filtradas + opciones de filtro para el frontend
export const getSalesReport = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const userPermissions: string[] = (res.locals.user as any).permissions || [];
    
    const {
      startDate,
      endDate,
      warehouseId,
      productId,
      categoryId,
      currencyId,
      paymentTypeId,
      status,
      isPaid,
      createdById,
      customerId,
      invoiceNumber,
      page,
      limit,
    } = req.query as {
      startDate: string;
      endDate: string;
      warehouseId?: string;
      productId?: string;
      categoryId?: string;
      currencyId?: string;
      paymentTypeId?: string;
      status?: 'PENDING' | 'APPROVED' | 'CANCELLED';
      isPaid?: string;
      createdById?: string;
      customerId?: string;
      invoiceNumber?: string;
      page?: string;
      limit?: string;
    };

    const result = await salesService.getSalesReport(userId, userPermissions, {
      startDate,
      endDate,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      productId: productId ? Number(productId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      currencyId: currencyId ? Number(currencyId) : undefined,
      paymentTypeId: paymentTypeId ? Number(paymentTypeId) : undefined,
      status,
      isPaid: isPaid !== undefined ? isPaid === 'true' : undefined,
      createdById: createdById ? Number(createdById) : undefined,
      customerId,
      invoiceNumber,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    res.json(result);
  } catch (error: any) {
    const status = error.name === 'ForbiddenError' ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
};
