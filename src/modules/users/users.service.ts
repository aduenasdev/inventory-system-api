import { db } from "../../db/connection";
import { userRoles } from "../../db/schema/user_roles";
import { userWarehouses } from "../../db/schema/user_warehouses";
import { roles } from "../../db/schema/roles";
import { warehouses } from "../../db/schema/warehouses";
import { sales } from "../../db/schema/sales";
import { purchases } from "../../db/schema/purchases";
import { transfers } from "../../db/schema/transfers";
import { and, eq, inArray } from "drizzle-orm";
import { users } from "../../db/schema/users";
import bcrypt from "bcrypt";
import { ConflictError, ValidationError, ForbiddenError, NotFoundError } from "../../utils/errors";

export async function assignRoleToUser(
  userId: number,
  data: { roleId?: number; roleIds?: number[] },
  currentUserId: number
) {
  // Evitar que un usuario modifique sus propios roles
  if (userId === currentUserId) {
    throw new ForbiddenError("No puedes modificar tus propios roles por política de seguridad. Contacta a soporte para asistencia.");
  }

  // Si viene roleIds (array), reemplazar todos los roles
  if (data.roleIds !== undefined) {
    // Validar que todos los roles existan
    if (data.roleIds.length > 0) {
      const existingRoles = await db
        .select({ id: roles.id })
        .from(roles)
        .where(inArray(roles.id, data.roleIds));
      
      if (existingRoles.length !== data.roleIds.length) {
        throw new NotFoundError("Al menos un rol de los seleccionados no existe");
      }
    }

    // Remover todos los roles actuales
    await db.delete(userRoles).where(eq(userRoles.userId, userId));

    // Agregar los nuevos roles
    if (data.roleIds.length > 0) {
      const roleAssignments = data.roleIds.map(roleId => ({
        userId,
        roleId
      }));
      await db.insert(userRoles).values(roleAssignments);
    }

    return { message: `${data.roleIds.length} rol(es) asignado(s) al usuario` };
  }

  // Si viene roleId (single), agregar un solo rol
  if (data.roleId !== undefined) {
    // Validar que el rol exista
    const roleExists = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, data.roleId))
      .limit(1);
    
    if (roleExists.length === 0) {
      throw new NotFoundError("El rol seleccionado no existe");
    }

    // Verificar si el usuario ya tiene ese rol
    const existing = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, data.roleId)));
    
    if (existing.length > 0) {
      throw new ConflictError("El usuario ya tiene ese rol asignado");
    }
    
    await db.insert(userRoles).values({ userId, roleId: data.roleId });
    return { message: "Rol asignado al usuario" };
  }

  throw new ValidationError("Debe proporcionar roleId o roleIds");
}

export async function removeRoleFromUser(userId: number, roleId: number, currentUserId: number) {
  // Evitar que un usuario modifique sus propios roles
  if (userId === currentUserId) {
    throw new ForbiddenError("No puedes modificar tus propios roles por política de seguridad. Contacta a soporte para asistencia.");
  }

  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  return { message: "Rol removido del usuario" };
}

export async function createUser(data: { 
  email: string; 
  password: string; 
  nombre: string;
  apellido?: string;
  telefono?: string;
  roleIds: number[]; 
  warehouseIds?: number[] 
}) {
  // Verificar si ya existe un usuario con ese email
  const existing = await db.select().from(users).where(eq(users.email, data.email));
  if (existing.length > 0) {
    throw new ConflictError(`Ya existe un usuario con el email "${data.email}"`);
  }

  // Validar que todos los roles existan
  if (data.roleIds && data.roleIds.length > 0) {
    const existingRoles = await db
      .select({ id: roles.id })
      .from(roles)
      .where(inArray(roles.id, data.roleIds));
    
    if (existingRoles.length !== data.roleIds.length) {
      throw new NotFoundError("Al menos un rol de los seleccionados no existe");
    }
  }

  // Validar que todos los warehouses existan
  if (data.warehouseIds && data.warehouseIds.length > 0) {
    const existingWarehouses = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(inArray(warehouses.id, data.warehouseIds));
    
    if (existingWarehouses.length !== data.warehouseIds.length) {
      throw new NotFoundError("Al menos un almacén de los seleccionados no existe");
    }
  }
  
  const hashed = await bcrypt.hash(data.password, 10);
  const [insert] = await db.insert(users).values({ 
    email: data.email, 
    password: hashed,
    nombre: data.nombre,
    apellido: data.apellido,
    telefono: data.telefono
  });
  
  // Assign roles to the user
  if (data.roleIds && data.roleIds.length > 0) {
    const roleAssignments = data.roleIds.map(roleId => ({
      userId: insert.insertId,
      roleId: roleId
    }));
    await db.insert(userRoles).values(roleAssignments);
  }
  
  // Assign warehouses to the user
  if (data.warehouseIds && data.warehouseIds.length > 0) {
    const warehouseAssignments = data.warehouseIds.map(warehouseId => ({
      userId: insert.insertId,
      warehouseId: warehouseId
    }));
    await db.insert(userWarehouses).values(warehouseAssignments);
  }
  
  // Obtener roles completos
  const userRolesList = data.roleIds.length > 0
    ? await db.select().from(roles).where(inArray(roles.id, data.roleIds))
    : [];
  
  // Obtener warehouses completos
  const userWarehousesList = (data.warehouseIds && data.warehouseIds.length > 0)
    ? await db.select().from(warehouses).where(inArray(warehouses.id, data.warehouseIds))
    : [];
  
  // Retornar toda la información del usuario creado
  const [createdUser] = await db.select().from(users).where(eq(users.id, insert.insertId));
  
  return {
    id: createdUser.id,
    email: createdUser.email,
    nombre: createdUser.nombre,
    apellido: createdUser.apellido,
    telefono: createdUser.telefono,
    enabled: createdUser.enabled,
    createdAt: createdUser.createdAt,
    roles: userRolesList,
    warehouses: userWarehousesList
  };
}

export async function getAllUsers() {
  const allUsers = await db.select().from(users);
  
  // Para cada usuario, obtener sus roles y warehouses
  const usersWithRelations = await Promise.all(
    allUsers.map(async (user) => {
      // Obtener roles del usuario
      const userRolesData = await db
        .select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(eq(userRoles.userId, user.id));
      
      const roleIds = userRolesData.map(ur => ur.roleId);
      const userRolesList = roleIds.length > 0 
        ? await db.select().from(roles).where(inArray(roles.id, roleIds))
        : [];
      
      // Obtener warehouses del usuario
      const userWarehousesData = await db
        .select({ warehouseId: userWarehouses.warehouseId })
        .from(userWarehouses)
        .where(eq(userWarehouses.userId, user.id));
      
      const warehouseIds = userWarehousesData.map(uw => uw.warehouseId);
      const userWarehousesList = warehouseIds.length > 0
        ? await db.select().from(warehouses).where(inArray(warehouses.id, warehouseIds))
        : [];
      
      return {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
        enabled: user.enabled,
        createdAt: user.createdAt,
        roles: userRolesList,
        warehouses: userWarehousesList
      };
    })
  );
  
  return usersWithRelations;
}

export async function getUserById(userId: number) {
  const rows = await db.select().from(users).where(eq(users.id, userId));
  const user = rows[0];
  
  if (!user) return null;
  
  // Obtener roles del usuario
  const userRolesData = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));
  
  const roleIds = userRolesData.map(ur => ur.roleId);
  const userRolesList = roleIds.length > 0 
    ? await db.select().from(roles).where(inArray(roles.id, roleIds))
    : [];
  
  // Obtener warehouses del usuario
  const userWarehousesData = await db
    .select({ warehouseId: userWarehouses.warehouseId })
    .from(userWarehouses)
    .where(eq(userWarehouses.userId, user.id));
  
  const warehouseIds = userWarehousesData.map(uw => uw.warehouseId);
  const userWarehousesList = warehouseIds.length > 0
    ? await db.select().from(warehouses).where(inArray(warehouses.id, warehouseIds))
    : [];
  
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    apellido: user.apellido,
    telefono: user.telefono,
    enabled: user.enabled,
    createdAt: user.createdAt,
    roles: userRolesList,
    warehouses: userWarehousesList
  };
}

export async function updateUser(userId: number, data: { 
  email?: string; 
  password?: string;
  nombre?: string;
  apellido?: string;
  telefono?: string;
  roleIds?: number[];
  warehouseIds?: number[];
}) {
  const updateData: any = {};
  
  if (data.email) {
    // Verificar si el email ya está en uso por otro usuario
    const existing = await db.select().from(users).where(eq(users.email, data.email));
    if (existing.length > 0 && existing[0].id !== userId) {
      throw new ConflictError(`El email "${data.email}" ya está en uso por otro usuario`);
    }
    updateData.email = data.email;
  }
  
  if (data.password) updateData.password = await bcrypt.hash(data.password, 10);
  if (data.nombre) updateData.nombre = data.nombre;
  if (data.apellido !== undefined) updateData.apellido = data.apellido;
  if (data.telefono !== undefined) updateData.telefono = data.telefono;
  
  // Actualizar roles si se proporcionan
  if (data.roleIds !== undefined) {
    // Validar que todos los roles existan
    if (data.roleIds.length > 0) {
      const existingRoles = await db
        .select({ id: roles.id })
        .from(roles)
        .where(inArray(roles.id, data.roleIds));
      
      if (existingRoles.length !== data.roleIds.length) {
        throw new NotFoundError("Al menos un rol de los seleccionados no existe");
      }
    }
    
    // Remover todos los roles actuales
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
    
    // Agregar los nuevos roles
    if (data.roleIds.length > 0) {
      const roleAssignments = data.roleIds.map(roleId => ({
        userId,
        roleId
      }));
      await db.insert(userRoles).values(roleAssignments);
    }
  }
  
  // Actualizar warehouses si se proporcionan
  if (data.warehouseIds !== undefined) {
    // Validar que todos los warehouses existan
    if (data.warehouseIds.length > 0) {
      const existingWarehouses = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(inArray(warehouses.id, data.warehouseIds));
      
      if (existingWarehouses.length !== data.warehouseIds.length) {
        throw new NotFoundError("Al menos un almacén de los seleccionados no existe");
      }
    }
    
    // Remover todos los warehouses actuales
    await db.delete(userWarehouses).where(eq(userWarehouses.userId, userId));
    
    // Agregar los nuevos warehouses
    if (data.warehouseIds.length > 0) {
      const warehouseAssignments = data.warehouseIds.map(warehouseId => ({
        userId,
        warehouseId
      }));
      await db.insert(userWarehouses).values(warehouseAssignments);
    }
  }
  
  // Actualizar los datos básicos del usuario si hay cambios
  if (Object.keys(updateData).length > 0) {
    await db.update(users).set(updateData).where(eq(users.id, userId));
  }
  
  // Retornar el usuario completo con roles y warehouses
  return getUserById(userId);
}

export async function disableUser(userId: number, currentUserId: number) {
  // Evitar que un usuario se deshabilite a sí mismo
  if (userId === currentUserId) {
    throw new ForbiddenError("No puedes deshabilitarte a ti mismo por política de seguridad. Contacta a soporte para asistencia.");
  }

  await db.update(users).set({ enabled: false }).where(eq(users.id, userId));
  return { message: "Usuario deshabilitado" };
}

export async function enableUser(userId: number) {
  await db.update(users).set({ enabled: true }).where(eq(users.id, userId));
  return { message: "Usuario habilitado" };
}

export async function deleteUser(userId: number, currentUserId: number) {
  // Evitar que un usuario se elimine a sí mismo
  if (userId === currentUserId) {
    throw new ForbiddenError("No puedes eliminarte a ti mismo por política de seguridad. Contacta a soporte para asistencia.");
  }

  // Verificar si el usuario tiene ventas asociadas (como creador)
  const salesAsCreator = await db
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.createdBy, userId))
    .limit(1);
  
  if (salesAsCreator.length > 0) {
    throw new ValidationError("No se puede eliminar el usuario porque tiene ventas asociadas");
  }

  // Verificar si el usuario tiene compras asociadas (como creador)
  const purchasesAsCreator = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.createdBy, userId))
    .limit(1);
  
  if (purchasesAsCreator.length > 0) {
    throw new ValidationError("No se puede eliminar el usuario porque tiene compras asociadas");
  }

  // Verificar si el usuario tiene transferencias asociadas (como creador)
  const transfersAsCreator = await db
    .select({ id: transfers.id })
    .from(transfers)
    .where(eq(transfers.createdBy, userId))
    .limit(1);
  
  if (transfersAsCreator.length > 0) {
    throw new ValidationError("No se puede eliminar el usuario porque tiene transferencias asociadas");
  }

  // Si no tiene registros asociados, eliminar el usuario
  // Las relaciones user_roles, user_warehouses y refresh_tokens se eliminan automáticamente (onDelete: cascade)
  await db.delete(users).where(eq(users.id, userId));
  
  return { message: "Usuario eliminado exitosamente" };
}

