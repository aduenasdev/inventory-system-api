import { ValidationError } from "./errors";

/**
 * Parsea una imagen en formato base64 y retorna el buffer
 * @param imageBase64 String base64 con o sin data URI prefix
 * @param maxSizeMB Tamaño máximo permitido en MB (default: 2MB)
 * @returns Buffer de la imagen
 */
export function parseBase64Image(imageBase64: string, maxSizeMB: number = 2): Buffer {
  let base64String = imageBase64;
  
  // Remover el prefijo data:image/...;base64, si existe
  if (imageBase64.startsWith('data:')) {
    const parts = imageBase64.split(',');
    if (parts.length !== 2) {
      throw new ValidationError('Formato base64 inválido. Use: data:image/...;base64,<data> o directamente el string base64');
    }
    base64String = parts[1];
  }
  
  // Decodificar base64 a buffer
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64String, 'base64');
  } catch (error) {
    throw new ValidationError('La cadena base64 proporcionada es inválida');
  }
  
  // Validar que no esté vacío
  if (!buffer || buffer.length < 10) {
    throw new ValidationError('La imagen base64 está vacía o es demasiado pequeña');
  }
  
  // Validar tamaño máximo
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (buffer.length > maxSizeBytes) {
    throw new ValidationError(`La imagen no puede exceder ${maxSizeMB}MB (tamaño actual: ${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
  }
  
  return buffer;
}
