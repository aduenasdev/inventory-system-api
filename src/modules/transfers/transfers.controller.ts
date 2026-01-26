import { Request, Response } from "express";
import { TransfersService } from "./transfers.service";

const transfersService = new TransfersService();

// ========== ENDPOINTS AUXILIARES ==========

export const getOriginWarehouses = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const warehouses = await transfersService.getOriginWarehouses(userId);
    res.json(warehouses);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getDestinationWarehouses = async (req: Request, res: Response) => {
  try {
    const warehouses = await transfersService.getDestinationWarehouses();
    res.json(warehouses);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getAvailableProducts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const warehouseId = parseInt(req.params.warehouseId);
    const { search, categoryId } = req.query;
    const products = await transfersService.getAvailableProducts(
      userId,
      warehouseId,
      search as string | undefined,
      categoryId ? parseInt(categoryId as string) : undefined
    );
    res.json(products);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await transfersService.getCategories();
    res.json(categories);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// ========== CRUD TRASLADOS ==========

export const createTransfer = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const userPermissions = (req as any).user.permissions || [];
    const result = await transfersService.createTransfer({ 
      ...req.body, 
      userId,
      userPermissions 
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllTransfers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate, warehouseId, status } = req.query;
    const transfers = await transfersService.getAllTransfers(
      userId,
      startDate as string,
      endDate as string | undefined,
      warehouseId ? parseInt(warehouseId as string) : undefined,
      status as string | undefined
    );
    res.json(transfers);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getTransferById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const transfer = await transfersService.getTransferById(id);
    res.json(transfer);
  } catch (error: any) {
    res.status(404).json({ message: error.message });
  }
};

export const acceptTransfer = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user.id;
    const result = await transfersService.acceptTransfer(id, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const rejectTransfer = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user.id;
    const { rejectionReason } = req.body;
    const result = await transfersService.rejectTransfer(id, rejectionReason, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const cancelTransfer = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = (req as any).user.id;
    const { cancellationReason } = req.body;
    const result = await transfersService.cancelTransfer(id, cancellationReason, userId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// ========== REPORTES ==========

export const getRejectedTransfersReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const report = await transfersService.getRejectedTransfersReport(
      startDate as string,
      endDate as string
    );
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getCancelledTransfersReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const report = await transfersService.getCancelledTransfersReport(
      startDate as string,
      endDate as string
    );
    res.json(report);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
