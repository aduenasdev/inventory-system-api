import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import authRoutes from "./modules/auth/auth.routes";
import roleRoutes from "./modules/roles/roles.routes";
import permissionRoutes from "./modules/permissions/permissions.routes";
import userRoutes from "./modules/users/users.routes";
import warehouseRoutes from "./modules/warehouses/warehouses.routes";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.use("/auth", authRoutes);
app.use("/roles", roleRoutes);
app.use("/permissions", permissionRoutes);
app.use("/users", userRoutes);
app.use("/warehouses", warehouseRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

export default app;
