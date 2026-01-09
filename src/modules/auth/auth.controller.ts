import { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  refreshTokenService,
} from "./auth.service";

export async function registerHandler(req: Request, res: Response) {
  try {
    const { user, accessToken, refreshToken } = await registerUser(req.body);
    res.status(201).json({
      message: "User registered successfully",
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
    const { user, accessToken, refreshToken } = await loginUser(req.body);
    res.status(200).json({
      message: "Login successful",
      user,
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
      message: "Tokens refreshed successfully",
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
