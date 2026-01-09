import { Request, Response } from "express";
import { assignRoleToUser, removeRoleFromUser, createUser, getAllUsers, getUserById, updateUser, disableUser, enableUser } from "./users.service";

export async function assignRoleToUserHandler(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const { roleId } = req.body;
    const result = await assignRoleToUser(Number(userId), roleId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function removeRoleFromUserHandler(req: Request, res: Response) {
  try {
    const { userId, roleId } = req.params;
    const result = await removeRoleFromUser(Number(userId), Number(roleId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function createUserHandler(req: Request, res: Response) {
  try {
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function getUsersHandler(req: Request, res: Response) {
  try {
    const users = await getAllUsers();
    res.status(200).json(users);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching users" });
  }
}

export async function getUserHandler(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const user = await getUserById(Number(userId));
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching user" });
  }
}

export async function updateUserHandler(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const result = await updateUser(Number(userId), req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function disableUserHandler(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const result = await disableUser(Number(userId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function enableUserHandler(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const result = await enableUser(Number(userId));
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
