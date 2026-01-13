import { Request, Response } from "express";
import {
  createWarehouse,
  getAllWarehouses,
  getUserActiveWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
  assignUserToWarehouse,
  removeUserFromWarehouse,
  getUsersInWarehouse,
} from "./warehouses.service";

export async function createWarehouseHandler(req: Request, res: Response) {
  try {
    const warehouse = await createWarehouse(req.body);
    res.status(201).json(warehouse);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getWarehousesHandler(req: Request, res: Response) {
  try {
    // Si la ruta es /active/me, retornar solo warehouses activos del usuario
    if (req.path === '/active/me') {
      const userId = res.locals.user.id;
      const warehouses = await getUserActiveWarehouses(userId);
      return res.status(200).json(warehouses);
    }
    
    // Si la ruta es /active, forzar active=true
    if (req.path === '/active') {
      const warehouses = await getAllWarehouses(true);
      return res.status(200).json(warehouses);
    }
    
    // Para /warehouses normal, usar el query param
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    const warehouses = await getAllWarehouses(active);
    res.status(200).json(warehouses);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching warehouses" });
  }
}

export async function getWarehouseHandler(req: Request, res: Response) {
  try {
    const { warehouseId } = req.params;
    const warehouse = await getWarehouseById(Number(warehouseId));
    if (!warehouse) return res.status(404).json({ message: "Warehouse not found" });
    res.status(200).json(warehouse);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching warehouse" });
  }
}

export async function updateWarehouseHandler(req: Request, res: Response) {
  try {
    const { warehouseId } = req.params;
    const result = await updateWarehouse(Number(warehouseId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function deleteWarehouseHandler(req: Request, res: Response) {
  try {
    const { warehouseId } = req.params;
    const result = await deleteWarehouse(Number(warehouseId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function assignUserToWarehouseHandler(req: Request, res: Response) {
  try {
    const { warehouseId } = req.params;
    const { userId } = req.body;
    const result = await assignUserToWarehouse(Number(warehouseId), userId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function removeUserFromWarehouseHandler(req: Request, res: Response) {
  try {
    const { warehouseId, userId } = req.params;
    const result = await removeUserFromWarehouse(Number(warehouseId), Number(userId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getUsersInWarehouseHandler(req: Request, res: Response) {
  try {
    const { warehouseId } = req.params;
    const users = await getUsersInWarehouse(Number(warehouseId));
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching users in warehouse" });
  }
}
