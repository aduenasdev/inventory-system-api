import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import path from "path";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/errorHandler";
import { apiLimiter, authLimiter } from "./middlewares/rateLimiter";
import authRoutes from "./modules/auth/auth.routes";
import roleRoutes from "./modules/roles/roles.routes";
import permissionRoutes from "./modules/permissions/permissions.routes";
import userRoutes from "./modules/users/users.routes";
import warehouseRoutes from "./modules/warehouses/warehouses.routes";
import unitRoutes from "./modules/units/units.routes";
import currencyRoutes from "./modules/currencies/currencies.routes";
import exchangeRateRoutes from "./modules/exchange_rates/exchange_rates.routes";
import categoryRoutes from "./modules/categories/categories.routes";
import productRoutes from "./modules/products/products.routes";
import paymentTypeRoutes from "./modules/payment_types/payment_types.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import purchaseRoutes from "./modules/purchases/purchases.routes";
import saleRoutes from "./modules/sales/sales.routes";
import transferRoutes from "./modules/transfers/transfers.routes";
import reportRoutes from "./modules/reports/reports.routes";
import { authMiddleware } from "./middlewares/auth.middleware";

const app = express();

// Security middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS configurado
const allowedOrigins = env.ALLOWED_ORIGINS?.split(",") || "*";
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Body parser
app.use(express.json());

// Logging
app.use(morgan("dev"));

// Rate limiting general (aplica a toda la API excepto /health)
app.use(apiLimiter);

// Servir imágenes estáticas con autenticación y CORS headers
app.use("/uploads", authMiddleware, (req, res, next) => {
  // Configurar headers CORS para las imágenes
  const origin = req.headers.origin;
  if (allowedOrigins === "*" || (Array.isArray(allowedOrigins) && origin && allowedOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  next();
}, express.static(path.join(process.cwd(), "uploads"), {
  maxAge: "1y", // Cache 1 año
  etag: true,
  lastModified: true,
}));

// Rutas de autenticación con rate limiting especial
app.use("/auth", authLimiter, authRoutes);
app.use("/roles", roleRoutes);
app.use("/permissions", permissionRoutes);
app.use("/users", userRoutes);
app.use("/warehouses", warehouseRoutes);
app.use("/units", unitRoutes);
app.use("/currencies", currencyRoutes);
app.use("/exchange_rates", exchangeRateRoutes);
app.use("/categories", categoryRoutes);
app.use("/products", productRoutes);
app.use("/payment_types", paymentTypeRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/purchases", purchaseRoutes);
app.use("/sales", saleRoutes);
app.use("/transfers", transferRoutes);
app.use("/reports", reportRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Middleware de manejo de errores (debe ser el último)
app.use(errorHandler);

export default app;
