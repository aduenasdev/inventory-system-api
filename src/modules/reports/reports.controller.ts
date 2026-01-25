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

// Bajo mínimo
export const getLowStock = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { warehouseId, minThreshold } = req.query as {
      warehouseId?: string;
      minThreshold?: string;
    };

    const result = await reportsService.getLowStock(
      userId,
      warehouseId ? Number(warehouseId) : undefined,
      minThreshold ? Number(minThreshold) : 10
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
