import { Request, Response } from "express";
import {
  createUnit,
  getAllUnits,
  getUnitById,
  updateUnit,
  disableUnit,
  enableUnit,
} from "./units.service";

export async function createUnitHandler(req: Request, res: Response) {
  try {
    const unit = await createUnit(req.body);
    res.status(201).json(unit);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getUnitsHandler(req: Request, res: Response) {
  try {
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    const units = await getAllUnits(active);
    res.status(200).json(units);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener unidades" });
  }
}

export async function getUnitHandler(req: Request, res: Response) {
  try {
    const { unitId } = req.params;
    const unit = await getUnitById(Number(unitId));
    if (!unit) return res.status(404).json({ message: "Unidad no encontrada" });
    res.status(200).json(unit);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener unidad" });
  }
}

export async function updateUnitHandler(req: Request, res: Response) {
  try {
    const { unitId } = req.params;
    const result = await updateUnit(Number(unitId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function disableUnitHandler(req: Request, res: Response) {
  try {
    const { unitId } = req.params;
    const result = await disableUnit(Number(unitId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function enableUnitHandler(req: Request, res: Response) {
  try {
    const { unitId } = req.params;
    const result = await enableUnit(Number(unitId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
