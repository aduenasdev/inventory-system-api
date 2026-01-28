import { Request, Response } from "express";
import { ReportsService } from "./reports.service";

const reportsService = new ReportsService();

// Stock actual
export const getStockReport = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { warehouseId, productId, categoryId } = req.query as {
      warehouseId?: string;
      productId?: string;
      categoryId?: string;
    };

    const result = await reportsService.getStockReport(
      userId,
      warehouseId ? Number(warehouseId) : undefined,
      productId ? Number(productId) : undefined,
      categoryId ? Number(categoryId) : undefined
    );

    res.json(result);
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
};

// Stock valorizado
export const getValorizedStock = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { warehouseId, productId, categoryId } = req.query as {
      warehouseId?: string;
      productId?: string;
      categoryId?: string;
    };

    const result = await reportsService.getValorizedStock(
      userId,
      warehouseId ? Number(warehouseId) : undefined,
      productId ? Number(productId) : undefined,
      categoryId ? Number(categoryId) : undefined
    );

    res.json(result);
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
};

// Bajo mínimo (usa minStock configurado en cada producto)
export const getLowStock = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { warehouseId } = req.query as {
      warehouseId?: string;
    };

    const result = await reportsService.getLowStock(
      userId,
      warehouseId ? Number(warehouseId) : undefined
    );

    res.json(result);
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
};

// Movimientos
export const getMovementsReport = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { warehouseId, startDate, endDate, type, productId } = req.query as {
      warehouseId?: string;
      startDate: string;
      endDate?: string;
      type?: string;
      productId?: string;
    };

    const result = await reportsService.getMovementsReport(
      userId,
      startDate,
      endDate || startDate, // Si no hay endDate, usar startDate (un solo día)
      warehouseId ? Number(warehouseId) : undefined,
      type,
      productId ? Number(productId) : undefined
    );

    res.json(result);
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
};

// Kardex
export const getKardex = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { productId, warehouseId, startDate, endDate } = req.query as {
      productId: string;
      warehouseId?: string;
      startDate?: string;
      endDate?: string;
    };

    const result = await reportsService.getKardex(
      userId,
      Number(productId),
      warehouseId ? Number(warehouseId) : undefined,
      startDate,
      endDate
    );

    res.json(result);
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : error.name === "NotFoundError" ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
};

// Profit Report (Utilidad)
export const getProfitReport = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { startDate, endDate, warehouseId, includeDetails } = req.query as {
      startDate: string;
      endDate?: string;
      warehouseId?: string;
      includeDetails?: string;
    };

    const result = await reportsService.getProfitReport(
      userId,
      startDate,
      endDate || startDate,
      warehouseId ? Number(warehouseId) : undefined,
      includeDetails === "true"
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : error.name === "NotFoundError" ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
};

// Export Profit Report CSV
export const exportProfitReportCSV = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { startDate, endDate, warehouseId } = req.query as {
      startDate: string;
      endDate?: string;
      warehouseId?: string;
    };

    const csv = await reportsService.exportProfitReportCSV(
      userId,
      startDate,
      endDate || startDate,
      warehouseId ? Number(warehouseId) : undefined
    );

    const filename = `profit_report_${startDate}_${endDate || startDate}.csv`;
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : error.name === "NotFoundError" ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
};

// ========== INVENTORY VALUATION (INFORME DE INVENTARIO) ==========
export const getInventoryValuation = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const query = req.query as {
      warehouseId?: string;
      categoryId?: string;
      productId?: string;
      cutoffDate?: string;
      onlyWithStock?: string;
      onlyBelowMin?: string;
      groupBy?: string;
      includeMovements?: string;
      includeKardex?: string;
      startDate?: string;
      endDate?: string;
    };

    const result = await reportsService.getInventoryValuation(userId, {
      warehouseId: query.warehouseId ? Number(query.warehouseId) : undefined,
      categoryId: query.categoryId ? Number(query.categoryId) : undefined,
      productId: query.productId ? Number(query.productId) : undefined,
      cutoffDate: query.cutoffDate,
      onlyWithStock: query.onlyWithStock === "true",
      onlyBelowMin: query.onlyBelowMin === "true",
      groupBy: query.groupBy as "warehouse" | "category" | "supplier" | "age" | undefined,
      includeMovements: query.includeMovements === "true",
      includeKardex: query.includeKardex === "true",
      startDate: query.startDate,
      endDate: query.endDate,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : error.name === "NotFoundError" ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
};

// Export Inventory Valuation CSV
export const exportInventoryValuationCSV = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const query = req.query as {
      warehouseId?: string;
      categoryId?: string;
    };

    const csv = await reportsService.exportInventoryValuationCSV(
      userId,
      query.warehouseId ? Number(query.warehouseId) : undefined,
      query.categoryId ? Number(query.categoryId) : undefined
    );

    const today = new Date().toISOString().split('T')[0];
    const filename = `inventory_valuation_${today}.csv`;
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error: any) {
    const status = error.name === "ForbiddenError" ? 403 : error.name === "NotFoundError" ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
};
