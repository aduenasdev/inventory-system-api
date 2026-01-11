import { Request, Response } from "express";
import { InventoryService } from "./inventory.service";

const inventoryService = new InventoryService();

export const getStockByWarehouseAndProduct = async (
  req: Request,
  res: Response
) => {
  try {
    const { warehouseId, productId } = req.params;
    const stock = await inventoryService.getStockByWarehouseAndProduct(
      Number(warehouseId),
      Number(productId)
    );
    res.json(stock);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getStockByWarehouse = async (req: Request, res: Response) => {
  try {
    const { warehouseId } = req.params;
    const stocks = await inventoryService.getStockByWarehouse(
      Number(warehouseId)
    );
    res.json(stocks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getProductKardex = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const kardex = await inventoryService.getProductKardex(Number(productId));
    res.json(kardex);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createAdjustment = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).userId;
    const movement = await inventoryService.createAdjustment({
      ...req.body,
      userId,
    });

    res.status(201).json({
      message: "Ajuste de inventario creado y aplicado exitosamente",
      data: movement,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getInventoryValueReport = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).userId;
    const { warehouseId } = req.query;
    const report = await inventoryService.getInventoryValueReport(
      userId,
      warehouseId ? Number(warehouseId) : undefined
    );
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getAdjustmentsReport = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).userId;
    const { startDate, endDate, warehouseId } = req.query;
    const report = await inventoryService.getAdjustmentsReport(
      userId,
      startDate as string,
      endDate as string,
      warehouseId ? Number(warehouseId) : undefined
    );
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
