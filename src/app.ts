import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import path from "path";
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
import { authMiddleware } from "./middlewares/auth.middleware";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Servir imágenes estáticas con autenticación
app.use("/uploads", authMiddleware, express.static(path.join(process.cwd(), "uploads"), {
  maxAge: "1y", // Cache 1 año
  etag: true,
  lastModified: true,
}));

app.use("/auth", authRoutes);
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

app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
