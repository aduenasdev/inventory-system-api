import { z } from "zod";

export const assignRoleToUserSchema = z.object({
  body: z.object({
    roleId: z.number().optional(),
    roleIds: z.array(z.number()).optional(),
  }).refine(
    (data) => data.roleId !== undefined || data.roleIds !== undefined,
    { message: "Debe proporcionar roleId o roleIds" }
  ),
  params: z.object({
    userId: z.string(),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Email inválido" }),
    password: z
      .string()
      .min(6, { message: "La contraseña debe tener al menos 6 caracteres" })
      .regex(/[A-Z]/, { message: "La contraseña debe contener al menos una mayúscula" })
      .regex(/[a-z]/, { message: "La contraseña debe contener al menos una minúscula" })
      .regex(/[0-9]/, { message: "La contraseña debe contener al menos un número" }),
    nombre: z.string().min(1, { message: "El nombre es requerido" }),
    apellido: z.string().optional(),
    telefono: z.string().optional(),
    roleIds: z.array(z.number()).min(1, { message: "Al menos un rol es requerido" }),
    warehouseIds: z.array(z.number()).optional(),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email({ message: "Email inválido" }).optional(),
    password: z
      .string()
      .min(6, { message: "La contraseña debe tener al menos 6 caracteres" })
      .regex(/[A-Z]/, { message: "La contraseña debe contener al menos una mayúscula" })
      .regex(/[a-z]/, { message: "La contraseña debe contener al menos una minúscula" })
      .regex(/[0-9]/, { message: "La contraseña debe contener al menos un número" })
      .optional(),
    nombre: z.string().min(1, { message: "El nombre es requerido" }).optional(),
    apellido: z.string().optional(),
    telefono: z.string().optional(),
    roleIds: z.array(z.number()).optional(),
    warehouseIds: z.array(z.number()).optional(),
  }),
  params: z.object({
    userId: z.string(),
  }),
});
