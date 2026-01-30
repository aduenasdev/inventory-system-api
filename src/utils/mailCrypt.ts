import bcrypt from "bcrypt";

/**
 * Genera un hash bcrypt para la contraseña del correo
 * Usa el mismo método que la contraseña del usuario (bcrypt)
 * 
 * @param password - Contraseña en texto plano
 * @returns Hash bcrypt
 */
export async function generateMailPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

/**
 * Verifica una contraseña contra un hash bcrypt
 * 
 * @param password - Contraseña en texto plano a verificar
 * @param hashedPassword - Hash bcrypt almacenado
 * @returns true si la contraseña coincide
 */
export async function verifyMailPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error: any) {
    console.error("[mailCrypt] ❌ Error verificando password:", error.message);
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
