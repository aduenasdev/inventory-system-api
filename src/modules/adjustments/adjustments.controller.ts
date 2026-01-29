import { Request, Response } from "express";
import { adjustmentsService } from "./adjustments.service";

// ========== ENDPOINTS AUXILIARES ==========

// GET /adjustments/warehouses - establecimientos del usuario
export const getWarehouses = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const warehouses = await adjustmentsService.getUserWarehouses(userId);
    res.json(warehouses);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /adjustments/adjustment-types - Tipos de ajuste
export const getAdjustmentTypes = async (req: Request, res: Response) => {
  try {
    const types = await adjustmentsService.getAdjustmentTypes();
    res.json(types);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /adjustments/products-with-stock/:warehouseId - Productos con stock (para salidas)
export const getProductsWithStock = async (req: Request, res: Response) => {
  try {
    const { warehouseId } = req.params;
    const { search } = req.query;
    const products = await adjustmentsService.getProductsWithStock(
      Number(warehouseId),
      search as string
    );
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /adjustments/products - Todos los productos (para entradas)
export const getAllProducts = async (req: Request, res: Response) => {
  try {
    const { search, categoryId } = req.query;
    const products = await adjustmentsService.getAllProducts(
      search as string,
      categoryId ? Number(categoryId) : undefined
    );
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /adjustments/currencies - Monedas activas
export const getCurrencies = async (req: Request, res: Response) => {
  try {
    const currencies = await adjustmentsService.getCurrencies();
    res.json(currencies);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ========== CRUD DE AJUSTES ==========

// POST /adjustments - Crear ajuste
export const createAdjustment = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const result = await adjustmentsService.create({
      ...req.body,
      userId,
    });
    res.status(201).json(result);
  } catch (error: any) {
    const status =
      error.name === "NotFoundError" ? 404 :
      error.name === "ForbiddenError" ? 403 :
      error.name === "ValidationError" ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};

// GET /adjustments - Listar ajustes
export const getAllAdjustments = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { startDate, endDate, warehouseId, status } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate y endDate son requeridos" });
    }

    const adjustments = await adjustmentsService.getAll(
      userId,
      startDate as string,
      endDate as string,
      warehouseId ? Number(warehouseId) : undefined,
      status as string
    );
    res.json(adjustments);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /adjustments/:id - Obtener ajuste por ID
export const getAdjustmentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adjustment = await adjustmentsService.getById(Number(id));
    res.json(adjustment);
  } catch (error: any) {
    const status = error.name === "NotFoundError" ? 404 : 500;
    res.status(status).json({ message: error.message });
  }
};

// PUT /adjustments/:id/accept - Aprobar ajuste
export const acceptAdjustment = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { id } = req.params;
    const result = await adjustmentsService.accept(Number(id), userId);
    res.json(result);
  } catch (error: any) {
    const status =
      error.name === "NotFoundError" ? 404 :
      error.name === "ValidationError" ? 400 :
      error.name === "ConflictError" ? 409 : 500;
    res.status(status).json({ message: error.message });
  }
};

// PUT /adjustments/:id/cancel - Cancelar ajuste
export const cancelAdjustment = async (req: Request, res: Response) => {
  try {
    const userId = (res.locals.user as any).id;
    const { id } = req.params;
    const { cancellationReason } = req.body;

    if (!cancellationReason || cancellationReason.trim().length < 10) {
      return res.status(400).json({
        message: "El motivo de cancelación debe tener al menos 10 caracteres",
      });
    }

    const result = await adjustmentsService.cancel(Number(id), cancellationReason, userId);
    res.json(result);
  } catch (error: any) {
    const status =
      error.name === "NotFoundError" ? 404 :
      error.name === "ForbiddenError" ? 403 :
      error.name === "ConflictError" ? 409 :
      error.name === "ValidationError" ? 400 : 500;
    res.status(status).json({ message: error.message });
  }
};
