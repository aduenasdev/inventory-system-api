import { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  refreshTokenService,
  changePassword,
} from "./auth.service";

export async function registerHandler(req: Request, res: Response) {
  try {
    const { user, accessToken, refreshToken } = await registerUser(req.body);
    res.status(201).json({
      message: "Usuario registrado exitosamente",
      user,
      accessToken,
      refreshToken,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function loginHandler(req: Request, res: Response) {
  try {
    const { user, roles, permissions, accessToken, refreshToken } = await loginUser({
      body: req.body
    } as any);
    res.status(200).json({
      message: "Inicio de sesión exitoso",
      user,
      roles,
      permissions,
      accessToken,
      refreshToken,
    });
  } catch (error: any) {
    res.status(401).json({ message: error.message });
  }
}

export async function refreshTokenHandler(req: Request, res: Response) {
  try {
    const { accessToken, refreshToken } = await refreshTokenService(
      req.body.refreshToken
    );
    res.status(200).json({
      message: "Tokens renovados exitosamente",
      accessToken,
      refreshToken,
    });
  } catch (error: any) {
    res.status(401).json({ message: error.message });
  }
}

export async function meHandler(req: Request, res: Response) {
  res.status(200).json(res.locals.user);
}

export async function changePasswordHandler(req: Request, res: Response) {
  try {
    const userId = res.locals.user.id; // Usuario autenticado
    const result = await changePassword(userId, {
      body: req.body
    } as any);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
