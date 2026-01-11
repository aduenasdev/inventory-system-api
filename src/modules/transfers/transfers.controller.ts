import { Request, Response } from "express";
import { TransfersService } from "./transfers.service";

const transfersService = new TransfersService();

export const createTransfer = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const result = await transfersService.createTransfer({ ...req.body, userId });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllTransfers = async (req: Request, res: Response) => {
  try {
    const transfers = await transfersService.getAllTransfers();
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

export const getTransfersByWarehouse = async (req: Request, res: Response) => {
  try {
    const warehouseId = parseInt(req.query.warehouseId as string);
    const transfers = await transfersService.getTransfersByWarehouse(warehouseId);
    res.json(transfers);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
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
