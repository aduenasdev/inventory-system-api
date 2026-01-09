import { Request, Response } from "express";
import { getAllPermissions } from "./permissions.service";

export async function getPermissionsHandler(req: Request, res: Response) {
  try {
    const permissions = await getAllPermissions();
    res.status(200).json(permissions);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching permissions" });
  }
}
