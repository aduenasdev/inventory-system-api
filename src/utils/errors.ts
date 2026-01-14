/**
 * Clase base para errores operacionales de la aplicación
 */
export class AppError extends Error {
  public readonly isOperational: boolean = true;

  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error 404 - Recurso no encontrado
 */
export class NotFoundError extends AppError {
  constructor(message: string = "Recurso no encontrado") {
    super(message, 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error 400 - Validación fallida
 */
export class ValidationError extends AppError {
  constructor(message: string = "Error de validación") {
    super(message, 400);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error 401 - No autenticado
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "No autorizado: Token inválido o ausente") {
    super(message, 401);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Error 403 - Sin permisos
 */
export class ForbiddenError extends AppError {
  constructor(message: string = "Acceso denegado: Permisos insuficientes") {
    super(message, 403);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Error 409 - Conflicto (ej: recurso duplicado)
 */
export class ConflictError extends AppError {
  constructor(message: string = "Conflicto: El recurso ya existe") {
    super(message, 409);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Error 429 - Demasiadas peticiones
 */
export class TooManyRequestsError extends AppError {
  constructor(message: string = "Demasiadas peticiones, intente más tarde") {
    super(message, 429);
    Object.setPrototypeOf(this, TooManyRequestsError.prototype);
  }
}
