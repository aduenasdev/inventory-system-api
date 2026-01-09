import { Request, Response } from "express";
import {
  createPaymentType,
  getAllPaymentTypes,
  getPaymentTypeById,
  updatePaymentType,
  disablePaymentType,
  enablePaymentType,
} from "./payment_types.service";

export async function createPaymentTypeHandler(req: Request, res: Response) {
  try {
    const paymentType = await createPaymentType(req.body);
    res.status(201).json(paymentType);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getPaymentTypesHandler(req: Request, res: Response) {
  try {
    const paymentTypes = await getAllPaymentTypes();
    res.status(200).json(paymentTypes);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener tipos de pago" });
  }
}

export async function getPaymentTypeHandler(req: Request, res: Response) {
  try {
    const { paymentTypeId } = req.params;
    const paymentType = await getPaymentTypeById(Number(paymentTypeId));
    if (!paymentType) return res.status(404).json({ message: "Tipo de pago no encontrado" });
    res.status(200).json(paymentType);
  } catch (error: any) {
    res.status(500).json({ message: "Error al obtener tipo de pago" });
  }
}

export async function updatePaymentTypeHandler(req: Request, res: Response) {
  try {
    const { paymentTypeId } = req.params;
    const result = await updatePaymentType(Number(paymentTypeId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function disablePaymentTypeHandler(req: Request, res: Response) {
  try {
    const { paymentTypeId } = req.params;
    const result = await disablePaymentType(Number(paymentTypeId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function enablePaymentTypeHandler(req: Request, res: Response) {
  try {
    const { paymentTypeId } = req.params;
    const result = await enablePaymentType(Number(paymentTypeId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
