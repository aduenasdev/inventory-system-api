import { z } from "zod";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.string().default("3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // Database
  DB_HOST: z.string().min(1, "DB_HOST es requerido"),
  DB_PORT: z.string().min(1, "DB_PORT es requerido"),
  DB_USER: z.string().min(1, "DB_USER es requerido"),
  DB_PASSWORD: z.string().min(1, "DB_PASSWORD es requerido"),
  DB_NAME: z.string().min(1, "DB_NAME es requerido"),
  
  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET debe tener al menos 32 caracteres"),
  
  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_DIR: z.string().optional(),
  
  // CORS (opcional)
  ALLOWED_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

// Validar y exportar
let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Error de configuración: Variables de entorno inválidas");
    console.error(error.issues.map((e: any) => `  - ${e.path.join(".")}: ${e.message}`).join("\n"));
    process.exit(1);
  }
  throw error;
}

export { env };
