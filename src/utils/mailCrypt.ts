import { execSync } from "child_process";
import crypto from "crypto";

const IS_WINDOWS = process.platform === "win32";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Genera un hash SHA512-CRYPT compatible con Dovecot
 * 
 * EN LINUX/UBUNTU: Usa mkpasswd (método correcto para Dovecot)
 * EN WINDOWS: Usa crypto nativo (solo para development/testing)
 * 
 * Formato: $6$rounds=5000$salt$hash (Linux) o $6$salt$hash (Windows)
 * 
 * @param password - Contraseña en texto plano
 * @returns Hash SHA512-CRYPT compatible con Dovecot/PAM
 */
export function generateMailPassword(password: string): string {
  try {
    // ═══════════════════════════════════════════════════════════════
    // 🐧 LINUX/UBUNTU: Usar mkpasswd (método CORRECTO para Dovecot)
    // ═══════════════════════════════════════════════════════════════
    if (!IS_WINDOWS) {
      try {
        // ✅ Escapar caracteres especiales para bash
        const escapedPassword = password
          .replace(/\\/g, "\\\\")   // Escapar backslash
          .replace(/'/g, "'\\''")   // Escapar comillas simples
          .replace(/"/g, '\\"')     // Escapar comillas dobles
          .replace(/\$/g, "\\$")    // Escapar signo de dólar
          .replace(/`/g, "\\`");    // Escapar backticks

        // ✅ USAR mkpasswd del sistema (genera SHA512-CRYPT REAL)
        const hash = execSync(
          `mkpasswd -m sha-512 '${escapedPassword}'`,
          {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 5000
          }
        ).trim();

        // Validar que el hash tenga el formato correcto
        if (!hash.startsWith("$6$")) {
          throw new Error("Hash generado no tiene formato SHA512-CRYPT válido");
        }

        console.log(`[mailCrypt] ✅ Hash SHA512-CRYPT (mkpasswd): ${hash.substring(0, 30)}... (${hash.length} chars)`);
        return hash;
      } catch (mkpasswdError: any) {
        // Si mkpasswd falla en Linux, caer a método alternativo
        console.warn(`[mailCrypt] ⚠️ mkpasswd no disponible, usando fallback crypto:`, mkpasswdError.message);
        return generateMailPasswordFallback(password);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🪟 WINDOWS: Usar crypto nativo (fallback para development)
    // ═══════════════════════════════════════════════════════════════
    if (IS_WINDOWS && !IS_PRODUCTION) {
      console.warn(`[mailCrypt] ⚠️ Windows detectado - usando fallback crypto (solo para development)`);
      return generateMailPasswordFallback(password);
    }

    // ═══════════════════════════════════════════════════════════════
    // ❌ PRODUCTION EN WINDOWS: ERROR
    // ═══════════════════════════════════════════════════════════════
    throw new Error(
      "No se puede generar mail_password en Windows (producción). " +
      "Deploy en Linux/Ubuntu con mkpasswd disponible."
    );

  } catch (error: any) {
    console.error("[mailCrypt] ❌ Error generando mail password:", error.message);
    throw error;
  }
}

/**
 * Fallback para generar hash SHA512-CRYPT usando crypto nativo (Windows/testing)
 * ⚠️ NO es compatible 100% con Dovecot, solo para development
 * 
 * @param password - Contraseña en texto plano
 * @returns Hash en formato $6$salt$hash
 */
function generateMailPasswordFallback(password: string): string {
  try {
    // Generar salt aleatorio (16 caracteres base64 válidos para crypt)
    const saltChars = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let salt = "";
    const randomBytes = crypto.randomBytes(12);
    
    for (let i = 0; i < 16; i++) {
      salt += saltChars[randomBytes[i] % saltChars.length];
    }

    // Crear hash SHA512 iterativo (simulando múltiples rounds)
    let hash = password;
    for (let i = 0; i < 5000; i++) {
      hash = crypto
        .createHmac("sha512", salt)
        .update(hash)
        .digest("hex");
    }

    const result = `$6$${salt}$${hash.substring(0, 86)}`; // Limitar a 86 chars como SHA512-CRYPT
    
    console.log(`[mailCrypt] ℹ️ Hash fallback (crypto): ${result.substring(0, 30)}... (${result.length} chars)`);
    console.log(`[mailCrypt] ⚠️ NOTA: Este hash es solo para testing. En producción, usar Linux con mkpasswd.`);
    
    return result;
  } catch (error: any) {
    throw new Error(`Error en fallback crypto: ${error.message}`);
  }
}

/**
 * Verifica una contraseña contra un hash SHA512-CRYPT
 * 
 * NOTA: Para verificar passwords de correo en producción, usa doveadm:
 * doveadm auth test usuario@dominio.com password
 * 
 * @param password - Contraseña en texto plano a verificar
 * @param hashedPassword - Hash SHA512-CRYPT almacenado
 * @returns true si la contraseña coincide
 */
export function verifyMailPassword(password: string, hashedPassword: string): boolean {
  try {
    // Validar formato básico
    if (!hashedPassword.startsWith("$6$")) {
      console.error("[mailCrypt] ❌ Hash no tiene formato SHA512-CRYPT");
      return false;
    }

    // ═══════════════════════════════════════════════════════════════
    // 🐧 LINUX/UBUNTU: Usar mkpasswd (método CORRECTO)
    // ═══════════════════════════════════════════════════════════════
    if (!IS_WINDOWS) {
      try {
        const escapedPassword = password
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "'\\''")
          .replace(/"/g, '\\"')
          .replace(/\$/g, "\\$")
          .replace(/`/g, "\\`");

        const parts = hashedPassword.split("$");
        const salt = parts[2]; // Extraer salt (puede incluir rounds=N)

        const newHash = execSync(
          `mkpasswd -m sha-512 -S '${salt}' '${escapedPassword}'`,
          {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 5000
          }
        ).trim();

        return newHash === hashedPassword;
      } catch (mkpasswdError: any) {
        console.warn(`[mailCrypt] ⚠️ mkpasswd no disponible, usando fallback`);
        return verifyMailPasswordFallback(password, hashedPassword);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🪟 WINDOWS: Usar fallback
    // ═══════════════════════════════════════════════════════════════
    return verifyMailPasswordFallback(password, hashedPassword);

  } catch (error: any) {
    console.error("[mailCrypt] ❌ Error verificando password:", error.message);
    return false;
  }
}

/**
 * Fallback para verificar password usando crypto nativo
 * @param password - Contraseña en texto plano
 * @param hashedPassword - Hash almacenado
 * @returns true si coincide
 */
function verifyMailPasswordFallback(password: string, hashedPassword: string): boolean {
  try {
    const parts = hashedPassword.split("$");
    if (parts.length < 4) {
      return false;
    }

    const salt = parts[2];

    // Recrear hash con los mismos 5000 rounds
    let hash = password;
    for (let i = 0; i < 5000; i++) {
      hash = crypto
        .createHmac("sha512", salt)
        .update(hash)
        .digest("hex");
    }

    const newHash = `$6$${salt}$${hash.substring(0, 86)}`;
    return newHash === hashedPassword;
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
