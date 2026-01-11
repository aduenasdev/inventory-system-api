import { db } from "../../db/connection";
import { paymentTypes } from "../../db/schema/payment_types";
import { salesDetail } from "../../db/schema/sales_detail";
import { eq } from "drizzle-orm";

export async function createPaymentType(data: {
  type: string;
  description?: string;
}) {
  // Verificar si ya existe un tipo de pago con ese tipo
  const existing = await db.select().from(paymentTypes).where(eq(paymentTypes.type, data.type));
  if (existing.length > 0) {
    throw new Error(`Ya existe un tipo de pago con el tipo "${data.type}"`);
  }

  const [insert] = await db.insert(paymentTypes).values(data);
  return { id: insert.insertId, ...data };
}

export async function getAllPaymentTypes(activeFilter?: boolean) {
  if (activeFilter !== undefined) {
    return db.select().from(paymentTypes).where(eq(paymentTypes.isActive, activeFilter));
  }
  return db.select().from(paymentTypes);
}

export async function getPaymentTypeById(paymentTypeId: number) {
  const rows = await db.select().from(paymentTypes).where(eq(paymentTypes.id, paymentTypeId));
  return rows[0] || null;
}

export async function updatePaymentType(
  paymentTypeId: number,
  data: {
    type?: string;
    description?: string;
  }
) {
  const updateData: any = {};

  if (data.type) {
    const existing = await db.select().from(paymentTypes).where(eq(paymentTypes.type, data.type));
    if (existing.length > 0 && existing[0].id !== paymentTypeId) {
      throw new Error(`El tipo "${data.type}" ya está en uso por otro tipo de pago`);
    }
    updateData.type = data.type;
  }

  if (data.description !== undefined) updateData.description = data.description;

  await db.update(paymentTypes).set(updateData).where(eq(paymentTypes.id, paymentTypeId));
  
  // Retornar el tipo de pago actualizado
  const [updated] = await db.select().from(paymentTypes).where(eq(paymentTypes.id, paymentTypeId));
  return updated;
}

export async function disablePaymentType(paymentTypeId: number) {
  await db.update(paymentTypes).set({ isActive: false }).where(eq(paymentTypes.id, paymentTypeId));
  return { message: "Tipo de pago deshabilitado" };
}

export async function enablePaymentType(paymentTypeId: number) {
  await db.update(paymentTypes).set({ isActive: true }).where(eq(paymentTypes.id, paymentTypeId));
  return { message: "Tipo de pago habilitado" };
}

export async function deletePaymentType(paymentTypeId: number) {
  // Verificar si el tipo de pago está asociado a ventas
  const salesWithPaymentType = await db
    .select()
    .from(salesDetail)
    .where(eq(salesDetail.paymentTypeId, paymentTypeId))
    .limit(1);

  if (salesWithPaymentType.length > 0) {
    throw new Error("No se puede eliminar el tipo de pago porque tiene ventas asociadas");
  }

  await db.delete(paymentTypes).where(eq(paymentTypes.id, paymentTypeId));
  return { message: "Tipo de pago eliminado exitosamente" };
}
