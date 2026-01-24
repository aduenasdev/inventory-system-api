/**
 * Normaliza cualquier formato de fecha a YYYY-MM-DD
 * Acepta:
 * - "2026-01-12"
 * - "2026-01-12T10:30:00"
 * - "2026-01-12 10:30:00"
 * - Date objects
 * 
 * Retorna siempre: "2026-01-12" (string sin hora)
 */
export function normalizeBusinessDate(date: string | Date): string {
  if (!date) {
    throw new Error("Fecha requerida");
  }

  // Si ya es string en formato YYYY-MM-DD puro (sin hora)
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // Convertir a Date object si es string
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Validar que sea fecha válida
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Fecha inválida: ${date}`);
  }

  // Extraer año, mes, día en la zona horaria configurada (TZ)
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Obtiene la fecha actual en zona horaria local como string YYYY-MM-DD
 * USAR ESTO en lugar de new Date().toISOString().split("T")[0]
 * porque toISOString() usa UTC y puede dar fecha incorrecta
 */
export function getTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Valida que una fecha esté dentro de los últimos N días
 */
export function isWithinLastDays(date: string | Date, days: number): boolean {
  const targetDate = new Date(normalizeBusinessDate(date));
  targetDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const limitDate = new Date(today);
  limitDate.setDate(today.getDate() - days);

  return targetDate >= limitDate && targetDate <= today;
}
