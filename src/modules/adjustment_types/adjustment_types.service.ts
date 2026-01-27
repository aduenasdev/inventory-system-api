import { db } from "../../db/connection";
import { adjustmentTypes } from "../../db/schema/adjustment_types";
import { adjustments } from "../../db/schema/adjustments";
import { eq } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors";

export class AdjustmentTypesService {
  // Crear tipo de ajuste
  async create(data: { name: string; description?: string; affectsPositively: boolean }) {
    // Verificar si ya existe
    const existing = await db
      .select()
      .from(adjustmentTypes)
      .where(eq(adjustmentTypes.name, data.name));

    if (existing.length > 0) {
      throw new ConflictError(`Ya existe un tipo de ajuste con el nombre "${data.name}"`);
    }

    const [result] = (await db.insert(adjustmentTypes).values({
      name: data.name,
      description: data.description || null,
      affectsPositively: data.affectsPositively,
    })) as any;

    return {
      id: result.insertId,
      ...data,
    };
  }

  // Obtener todos los tipos de ajuste
  async getAll() {
    return await db.select().from(adjustmentTypes).orderBy(adjustmentTypes.name);
  }

  // Obtener tipo de ajuste por ID
  async getById(id: number) {
    const [type] = await db
      .select()
      .from(adjustmentTypes)
      .where(eq(adjustmentTypes.id, id));

    if (!type) {
      throw new NotFoundError("Tipo de ajuste no encontrado");
    }

    return type;
  }

  // Actualizar tipo de ajuste
  async update(id: number, data: { name?: string; description?: string; affectsPositively?: boolean }) {
    // Verificar que existe
    await this.getById(id);

    // Verificar nombre duplicado
    if (data.name) {
      const existing = await db
        .select()
        .from(adjustmentTypes)
        .where(eq(adjustmentTypes.name, data.name));

      if (existing.length > 0 && existing[0].id !== id) {
        throw new ConflictError(`El nombre "${data.name}" ya está en uso por otro tipo de ajuste`);
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.affectsPositively !== undefined) updateData.affectsPositively = data.affectsPositively;

    await db.update(adjustmentTypes).set(updateData).where(eq(adjustmentTypes.id, id));

    return await this.getById(id);
  }

  // Eliminar tipo de ajuste
  async delete(id: number) {
    // Verificar que existe
    await this.getById(id);

    // Verificar si tiene ajustes asociados
    const associatedAdjustments = await db
      .select({ id: adjustments.id })
      .from(adjustments)
      .where(eq(adjustments.adjustmentTypeId, id))
      .limit(1);

    if (associatedAdjustments.length > 0) {
      throw new ValidationError(
        "No se puede eliminar el tipo de ajuste porque tiene ajustes asociados"
      );
    }

    await db.delete(adjustmentTypes).where(eq(adjustmentTypes.id, id));

    return { message: "Tipo de ajuste eliminado exitosamente" };
  }
}

export const adjustmentTypesService = new AdjustmentTypesService();
