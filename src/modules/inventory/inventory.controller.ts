import { Request, Response } from "express";
import { InventoryService } from "./inventory.service";
import { lotService } from "./lots.service";

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
    const userId = (res.locals.user as any).id;
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
    const userId = (res.locals.user as any).id;
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
    const userId = (res.locals.user as any).id;
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

// ========== ENDPOINTS DE VISIBILIDAD DE LOTES ==========

// GET /inventory/lots/warehouse/:warehouseId - Listar lotes de un almacén
export const getLotsByWarehouse = async (req: Request, res: Response) => {
  try {
    const { warehouseId } = req.params;
    const lots = await lotService.getLotsByWarehouse(Number(warehouseId));
    res.json(lots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// GET /inventory/lots/product/:productId/warehouse/:warehouseId - Lotes activos de un producto en un almacén
export const getActiveLotsByProduct = async (req: Request, res: Response) => {
  try {
    const { productId, warehouseId } = req.params;
    const lots = await lotService.getActiveLotsByProductAndWarehouse(
      Number(productId),
      Number(warehouseId)
    );
    res.json(lots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// GET /inventory/lots/:lotId - Detalle de un lote
export const getLotById = async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const lot = await lotService.getLotById(Number(lotId));
    res.json(lot);
  } catch (error: any) {
    if (error.message.includes("no encontrado")) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

// GET /inventory/lots/:lotId/kardex - Kardex de un lote específico
export const getLotKardex = async (req: Request, res: Response) => {
  try {
    const { lotId } = req.params;
    const kardex = await lotService.getLotKardex(Number(lotId));
    res.json(kardex);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
