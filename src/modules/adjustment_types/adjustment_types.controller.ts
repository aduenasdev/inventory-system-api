import { Request, Response } from "express";
import { adjustmentTypesService } from "./adjustment_types.service";

export const createAdjustmentType = async (req: Request, res: Response) => {
  try {
    const result = await adjustmentTypesService.create(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    const status = error.name === "ConflictError" ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const getAllAdjustmentTypes = async (req: Request, res: Response) => {
  try {
    const types = await adjustmentTypesService.getAll();
    res.json(types);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener tipos de ajuste" });
  }
};

export const getAdjustmentTypeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const type = await adjustmentTypesService.getById(Number(id));
    res.json(type);
  } catch (error: any) {
    const status = error.name === "NotFoundError" ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};

export const updateAdjustmentType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await adjustmentTypesService.update(Number(id), req.body);
    res.json(result);
  } catch (error: any) {
    const status =
      error.name === "NotFoundError" ? 404 :
      error.name === "ConflictError" ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
};

export const deleteAdjustmentType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await adjustmentTypesService.delete(Number(id));
    res.json(result);
  } catch (error: any) {
    const status =
      error.name === "NotFoundError" ? 404 :
      error.name === "ValidationError" ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};
