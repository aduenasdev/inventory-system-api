import crypto from "crypto";

/**
 * Genera una contraseña SHA512 simple para correo electrónico
 * Formato: $6$ (SHA512) + salt aleatorio + hash
 * @param password - Contraseña en texto plano
 * @returns Contraseña hasheada en formato SHA512
 */
export function generateMailPassword(password: string): string {
  // Generar salt aleatorio de 8-16 caracteres
  const salt = crypto.randomBytes(12).toString("base64").replace(/[^a-zA-Z0-9]/g, "").substring(0, 16);
  
  // Crear hash SHA512 con salt
  const hash = crypto.createHmac("sha512", salt).update(password).digest("hex");
  
  // Retornar en formato similar a crypt: $6$salt$hash
  return `$6$${salt}$${hash}`;
}

/**
 * Verifica una contraseña contra su hash SHA512
 * @param password - Contraseña en texto plano a verificar
 * @param hashedPassword - Hash SHA512 almacenado
 * @returns true si la contraseña coincide, false si no
 */
export function verifyMailPassword(password: string, hashedPassword: string): boolean {
  try {
    // Extraer salt del hash
    const parts = hashedPassword.split("$");
    if (parts.length !== 4 || parts[1] !== "6") {
      return false;
    }
    
    const salt = parts[2];
    
    // Recrear hash con la contraseña proporcionada
    const newHash = crypto.createHmac("sha512", salt).update(password).digest("hex");
    
    // Comparar con el hash almacenado
    return newHash === parts[3];
  } catch {
    return false;
  }
}

/**
 * Genera el maildir basado en el email
 * Formato: dominio/usuario/
 * @param email - Email del usuario
 * @param domain - Dominio para el maildir (default: "sasinversus.com")
 * @returns Ruta del maildir
 */
export function generateMaildir(email: string, domain: string = "sasinversus.com"): string {
  const emailParts = email.split("@");
  const username = emailParts[0];
  
  return `${domain}/${username}/`;
}
