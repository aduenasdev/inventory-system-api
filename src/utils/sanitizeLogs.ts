/**
 * Lista de claves sensibles que deben ser ocultadas en logs
 */
const SENSITIVE_KEYS = [
  "password",
  "token",
  "refreshToken",
  "accessToken",
  "authorization",
  "cookie",
  "secret",
  "apiKey",
  "api_key",
];

/**
 * Sanitiza un objeto para remover información sensible antes de loggearlo
 * @param obj Objeto a sanitizar
 * @returns Objeto sanitizado con valores sensibles reemplazados por '***REDACTED***'
 */
export function sanitizeForLog(obj: any): any {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  // Si es un array, sanitizar cada elemento
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLog(item));
  }

  // Clonar el objeto para no mutar el original
  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Si la clave es sensible, redactarla
    if (SENSITIVE_KEYS.some((sensitiveKey) => lowerKey.includes(sensitiveKey))) {
      sanitized[key] = "***REDACTED***";
    }
    // Si el valor es un objeto, sanitizarlo recursivamente
    else if (value && typeof value === "object") {
      sanitized[key] = sanitizeForLog(value);
    }
    // Si no, mantener el valor original
    else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitiza los headers de un request para logging
 * @param headers Headers del request
 * @returns Headers sanitizados
 */
export function sanitizeHeaders(headers: any): any {
  return sanitizeForLog(headers);
}

/**
 * Sanitiza el body de un request para logging
 * @param body Body del request
 * @returns Body sanitizado
 */
export function sanitizeBody(body: any): any {
  return sanitizeForLog(body);
}
