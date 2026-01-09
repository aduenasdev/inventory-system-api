import { z } from "zod";

export const registerUserSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Email inválido" }),
    password: z
      .string()
      .min(6, { message: "La contraseña debe tener al menos 6 caracteres" })
      .regex(/[A-Z]/, { message: "La contraseña debe contener al menos una mayúscula" })
      .regex(/[a-z]/, { message: "La contraseña debe contener al menos una minúscula" })
      .regex(/[0-9]/, { message: "La contraseña debe contener al menos un número" }),
  }),
});

export const loginUserSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Email inválido" }),
    password: z.string({ message: "La contraseña es requerida" }),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string({ message: "El refresh token es requerido" }),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string({ message: "La contraseña actual es requerida" }),
    newPassword: z
      .string()
      .min(6, { message: "La contraseña debe tener al menos 6 caracteres" })
      .regex(/[A-Z]/, { message: "La contraseña debe contener al menos una mayúscula" })
      .regex(/[a-z]/, { message: "La contraseña debe contener al menos una minúscula" })
      .regex(/[0-9]/, { message: "La contraseña debe contener al menos un número" }),
  }),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
