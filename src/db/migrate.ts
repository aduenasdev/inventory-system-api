import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  // 1. Conectar sin especificar base de datos para poder crearla
  const connectionWithoutDb = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  // 2. Eliminar y crear la base de datos desde cero
  await connectionWithoutDb.execute(`DROP DATABASE IF EXISTS \`${process.env.DB_NAME}\``);
  console.log(`Base de datos '${process.env.DB_NAME}' eliminada.`);
  
  await connectionWithoutDb.execute(`CREATE DATABASE \`${process.env.DB_NAME}\` CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);
  console.log(`Base de datos '${process.env.DB_NAME}' creada.`);
  
  await connectionWithoutDb.end();

  // 3. Conectar a la base de datos recién creada
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const db = drizzle(pool);

  // ═══════════════════════════════════════════════════════════════
  // TABLAS BASE (usuarios, roles, permisos)
  // ═══════════════════════════════════════════════════════════════

  await db.execute(sql`
    CREATE TABLE roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      description TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100),
      telefono VARCHAR(20),
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      group_name VARCHAR(50) NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE role_permissions (
      role_id INT NOT NULL,
      permission_id INT NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (permission_id) REFERENCES permissions(id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE user_roles (
      user_id INT NOT NULL,
      role_id INT NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    )
  `);

  await db.execute(sql`
    CREATE TABLE refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token VARCHAR(255) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ═══════════════════════════════════════════════════════════════
  // TABLAS DE CONFIGURACIÓN (almacenes, unidades, monedas, etc.)
  // ═══════════════════════════════════════════════════════════════

  await db.execute(sql`
    CREATE TABLE warehouses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      provincia VARCHAR(100) NOT NULL,
      municipio VARCHAR(100) NOT NULL,
      direccion TEXT,
      ubicacion VARCHAR(255),
      active BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await db.execute(sql`
    CREATE TABLE user_warehouses (
      user_id INT NOT NULL,
      warehouse_id INT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (user_id, warehouse_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
    )
  `);

  await db.execute(sql`
    CREATE TABLE units (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      short_name VARCHAR(20) NOT NULL UNIQUE,
      description TEXT,
      type ENUM('weight', 'volume', 'length', 'countable', 'package') NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(sql`
    CREATE TABLE currencies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      code VARCHAR(10) NOT NULL UNIQUE,
      symbol VARCHAR(10) NOT NULL,
      decimal_places INT NOT NULL DEFAULT 2,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(sql`
    CREATE TABLE exchange_rates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_currency_id INT NOT NULL,
      to_currency_id INT NOT NULL,
      rate DECIMAL(18, 2) NOT NULL,
      date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_rate_per_day (from_currency_id, to_currency_id, date),
      FOREIGN KEY (from_currency_id) REFERENCES currencies(id),
      FOREIGN KEY (to_currency_id) REFERENCES currencies(id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.execute(sql`
    CREATE TABLE payment_types (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // ═══════════════════════════════════════════════════════════════
  // PRODUCTOS
  // ═══════════════════════════════════════════════════════════════

  await db.execute(sql`
    CREATE TABLE products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      code VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      cost_price DECIMAL(18, 2),
      sale_price DECIMAL(18, 2),
      currency_id INT NOT NULL,
      unit_id INT NOT NULL,
      category_id INT NOT NULL DEFAULT 0,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (currency_id) REFERENCES currencies(id),
      FOREIGN KEY (unit_id) REFERENCES units(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // ═══════════════════════════════════════════════════════════════
  // INVENTARIO (caché de stock + lotes)
  // ═══════════════════════════════════════════════════════════════

  await db.execute(sql`
    CREATE TABLE inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      warehouse_id INT NOT NULL,
      product_id INT NOT NULL,
      current_quantity DECIMAL(18, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY unique_warehouse_product (warehouse_id, product_id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // LOTES DE INVENTARIO (tabla principal del sistema de lotes)
  await db.execute(sql`
    CREATE TABLE inventory_lots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lot_code VARCHAR(50) NOT NULL UNIQUE,
      
      product_id INT NOT NULL,
      warehouse_id INT NOT NULL,
      
      initial_quantity DECIMAL(18, 2) NOT NULL,
      current_quantity DECIMAL(18, 2) NOT NULL,
      
      unit_cost_base DECIMAL(18, 2) NOT NULL,
      
      original_currency_id INT NOT NULL,
      original_unit_cost DECIMAL(18, 2) NOT NULL,
      exchange_rate DECIMAL(18, 2) NOT NULL,
      
      source_type ENUM('PURCHASE', 'TRANSFER', 'ADJUSTMENT', 'MIGRATION') NOT NULL,
      source_id INT,
      source_lot_id INT,
      
      entry_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      
      status ENUM('ACTIVE', 'EXHAUSTED') NOT NULL DEFAULT 'ACTIVE',
      
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (original_currency_id) REFERENCES currencies(id),
      FOREIGN KEY (source_lot_id) REFERENCES inventory_lots(id),
      
      INDEX idx_lot_fifo (product_id, warehouse_id, status, entry_date, id),
      INDEX idx_lot_warehouse (warehouse_id),
      INDEX idx_lot_product (product_id),
      INDEX idx_lot_source (source_type, source_id)
    )
  `);

  // CONSUMOS DE LOTES (trazabilidad)
  await db.execute(sql`
    CREATE TABLE lot_consumptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lot_id INT NOT NULL,
      
      consumption_type ENUM('SALE', 'TRANSFER', 'ADJUSTMENT', 'CANCELLATION') NOT NULL,
      
      reference_type VARCHAR(50) NOT NULL,
      reference_id INT NOT NULL,
      
      quantity DECIMAL(18, 2) NOT NULL,
      
      unit_cost_at_consumption DECIMAL(18, 2) NOT NULL,
      total_cost DECIMAL(18, 2) NOT NULL,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      
      FOREIGN KEY (lot_id) REFERENCES inventory_lots(id),
      INDEX idx_consumption_lot (lot_id),
      INDEX idx_consumption_reference (reference_type, reference_id)
    )
  `);

  // Movimientos de inventario (auditoría general)
  await db.execute(sql`
    CREATE TABLE inventory_movements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type ENUM('INVOICE_ENTRY', 'SALE_EXIT', 'TRANSFER_ENTRY', 'TRANSFER_EXIT', 'ADJUSTMENT_ENTRY', 'ADJUSTMENT_EXIT') NOT NULL,
      status ENUM('PENDING', 'APPROVED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
      warehouse_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(18, 2) NOT NULL,
      reference VARCHAR(255),
      reason TEXT,
      lot_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (lot_id) REFERENCES inventory_lots(id)
    )
  `);

  // ═══════════════════════════════════════════════════════════════
  // COMPRAS
  // ═══════════════════════════════════════════════════════════════

  await db.execute(sql`
    CREATE TABLE purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(50) NOT NULL UNIQUE,
      supplier_name VARCHAR(255),
      supplier_phone VARCHAR(50),
      date DATE NOT NULL,
      warehouse_id INT NOT NULL,
      currency_id INT NOT NULL,
      status ENUM('PENDING', 'APPROVED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
      subtotal DECIMAL(18, 2) NOT NULL,
      total DECIMAL(18, 2) NOT NULL,
      notes TEXT,
      cancellation_reason TEXT,
      created_by INT NOT NULL,
      accepted_by INT,
      cancelled_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      accepted_at TIMESTAMP NULL,
      cancelled_at TIMESTAMP NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (currency_id) REFERENCES currencies(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (accepted_by) REFERENCES users(id),
      FOREIGN KEY (cancelled_by) REFERENCES users(id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE purchases_detail (
      id INT AUTO_INCREMENT PRIMARY KEY,
      purchase_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(18, 2) NOT NULL,
      unit_cost DECIMAL(18, 2) NOT NULL,
      original_currency_id INT,
      exchange_rate_used DECIMAL(18, 2),
      converted_unit_cost DECIMAL(18, 2),
      subtotal DECIMAL(18, 2) NOT NULL,
      lot_id INT,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (original_currency_id) REFERENCES currencies(id),
      FOREIGN KEY (lot_id) REFERENCES inventory_lots(id)
    )
  `);

  // ═══════════════════════════════════════════════════════════════
  // VENTAS
  // ═══════════════════════════════════════════════════════════════

  await db.execute(sql`
    CREATE TABLE sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(50) NOT NULL UNIQUE,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(50),
      date DATE NOT NULL,
      warehouse_id INT NOT NULL,
      currency_id INT NOT NULL,
      payment_type_id INT,
      status ENUM('PENDING', 'APPROVED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
      subtotal DECIMAL(18, 2) NOT NULL,
      total DECIMAL(18, 2) NOT NULL,
      notes TEXT,
      cancellation_reason TEXT,
      is_paid BOOLEAN NOT NULL DEFAULT FALSE,
      paid_by INT,
      paid_at TIMESTAMP NULL,
      created_by INT NOT NULL,
      accepted_by INT,
      cancelled_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      accepted_at TIMESTAMP NULL,
      cancelled_at TIMESTAMP NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (currency_id) REFERENCES currencies(id),
      FOREIGN KEY (payment_type_id) REFERENCES payment_types(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (accepted_by) REFERENCES users(id),
      FOREIGN KEY (cancelled_by) REFERENCES users(id),
      FOREIGN KEY (paid_by) REFERENCES users(id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE sales_detail (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(18, 2) NOT NULL,
      unit_price DECIMAL(18, 2) NOT NULL,
      payment_type_id INT NOT NULL,
      original_currency_id INT,
      exchange_rate_used DECIMAL(18, 2),
      converted_unit_price DECIMAL(18, 2),
      subtotal DECIMAL(18, 2) NOT NULL,
      real_cost DECIMAL(18, 2),
      margin DECIMAL(18, 2),
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (payment_type_id) REFERENCES payment_types(id),
      FOREIGN KEY (original_currency_id) REFERENCES currencies(id)
    )
  `);

  // ═══════════════════════════════════════════════════════════════
  // TRASLADOS
  // ═══════════════════════════════════════════════════════════════

  await db.execute(sql`
    CREATE TABLE transfers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      origin_warehouse_id INT NOT NULL,
      destination_warehouse_id INT NOT NULL,
      status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
      notes TEXT,
      rejection_reason TEXT,
      created_by INT NOT NULL,
      approved_by INT,
      rejected_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      approved_at TIMESTAMP NULL,
      rejected_at TIMESTAMP NULL,
      FOREIGN KEY (origin_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id),
      FOREIGN KEY (rejected_by) REFERENCES users(id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE transfers_detail (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transfer_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(18, 2) NOT NULL,
      FOREIGN KEY (transfer_id) REFERENCES transfers(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  console.log("✅ Todas las tablas creadas exitosamente.");

  // ═══════════════════════════════════════════════════════════════
  // SEED DE DATOS INICIALES
  // ═══════════════════════════════════════════════════════════════

  // Crear rol de administrador
  const [adminRoleResult] = (await db.execute(
    sql`INSERT INTO roles (name, description) VALUES ('admin', 'Administrador con todos los privilegios')`
  )) as any[];
  const adminRoleId = adminRoleResult.insertId;
  console.log("Rol 'admin' creado.");

  // Crear usuario administrador
  const hashedPassword = await bcrypt.hash("Admin123", 10);
  const [adminUserResult] = (await db.execute(
    sql`INSERT INTO users (email, password, nombre) VALUES (${"admin@sasinversus.com"}, ${hashedPassword}, ${"Admin"})`
  )) as any[];
  const adminUserId = adminUserResult.insertId;
  console.log("Usuario 'admin@sasinversus.com' creado.");

  // Asociar usuario admin con rol admin
  await db.execute(sql`INSERT INTO user_roles (user_id, role_id) VALUES (${adminUserId}, ${adminRoleId})`);

  // Poblar permisos
  const fixedPermissions = [
    // CRUD usuarios
    { name: 'users.read', description: 'Leer usuarios', group_name: 'users' },
    { name: 'users.create', description: 'Crear usuarios', group_name: 'users' },
    { name: 'users.update', description: 'Actualizar usuarios', group_name: 'users' },
    { name: 'users.delete', description: 'Eliminar usuarios', group_name: 'users' },
    { name: 'users.roles.associate', description: 'Asociar roles a usuarios', group_name: 'users' },
    { name: 'users.warehouses.associate', description: 'Asociar usuarios a almacenes', group_name: 'users' },

    // CRUD almacenes
    { name: 'warehouses.read', description: 'Leer almacenes', group_name: 'warehouses' },
    { name: 'warehouses.create', description: 'Crear almacenes', group_name: 'warehouses' },
    { name: 'warehouses.update', description: 'Actualizar almacenes', group_name: 'warehouses' },
    { name: 'warehouses.delete', description: 'Eliminar almacenes', group_name: 'warehouses' },

    // CRUD roles
    { name: 'roles.read', description: 'Leer roles', group_name: 'roles' },
    { name: 'roles.create', description: 'Crear roles', group_name: 'roles' },
    { name: 'roles.update', description: 'Actualizar roles', group_name: 'roles' },
    { name: 'roles.delete', description: 'Eliminar roles', group_name: 'roles' },

    // CRUD unidades de medida
    { name: 'units.read', description: 'Leer unidades de medida', group_name: 'units' },
    { name: 'units.create', description: 'Crear unidades de medida', group_name: 'units' },
    { name: 'units.update', description: 'Actualizar unidades de medida', group_name: 'units' },
    { name: 'units.delete', description: 'Eliminar unidades de medida', group_name: 'units' },

    // CRUD monedas
    { name: 'currencies.read', description: 'Leer monedas', group_name: 'currencies' },
    { name: 'currencies.create', description: 'Crear monedas', group_name: 'currencies' },
    { name: 'currencies.update', description: 'Actualizar monedas', group_name: 'currencies' },
    { name: 'currencies.delete', description: 'Eliminar monedas', group_name: 'currencies' },

    // CRUD tasas de cambio
    { name: 'exchange_rates.read', description: 'Leer tasas de cambio', group_name: 'exchange_rates' },
    { name: 'exchange_rates.create', description: 'Crear tasas de cambio', group_name: 'exchange_rates' },
    { name: 'exchange_rates.update', description: 'Actualizar tasas de cambio', group_name: 'exchange_rates' },
    { name: 'exchange_rates.delete', description: 'Eliminar tasas de cambio', group_name: 'exchange_rates' },

    // CRUD categorías
    { name: 'categories.read', description: 'Leer categorías', group_name: 'categories' },
    { name: 'categories.create', description: 'Crear categorías', group_name: 'categories' },
    { name: 'categories.update', description: 'Actualizar categorías', group_name: 'categories' },
    { name: 'categories.delete', description: 'Eliminar categorías', group_name: 'categories' },

    // CRUD productos
    { name: 'products.read', description: 'Leer productos', group_name: 'products' },
    { name: 'products.create', description: 'Crear productos', group_name: 'products' },
    { name: 'products.update', description: 'Actualizar productos', group_name: 'products' },
    { name: 'products.delete', description: 'Eliminar productos', group_name: 'products' },
    { name: 'products.cost.read', description: 'Ver precio de costo de productos', group_name: 'products' },

    // CRUD tipos de pago
    { name: 'payment_types.read', description: 'Leer tipos de pago', group_name: 'payment_types' },
    { name: 'payment_types.create', description: 'Crear tipos de pago', group_name: 'payment_types' },
    { name: 'payment_types.update', description: 'Actualizar tipos de pago', group_name: 'payment_types' },
    { name: 'payment_types.delete', description: 'Eliminar tipos de pago', group_name: 'payment_types' },

    // Inventario
    { name: 'inventory.read', description: 'Consultar inventario', group_name: 'inventory' },
    { name: 'inventory.adjustments.create', description: 'Crear ajustes de inventario', group_name: 'inventory' },
    { name: 'inventory.adjustments.approve', description: 'Aprobar ajustes de inventario', group_name: 'inventory' },
    { name: 'inventory.lots.read', description: 'Consultar lotes de inventario', group_name: 'inventory' },

    // Compras
    { name: 'purchases.read', description: 'Leer facturas de compra', group_name: 'purchases' },
    { name: 'purchases.create', description: 'Crear facturas de compra', group_name: 'purchases' },
    { name: 'purchases.accept', description: 'Aceptar facturas de compra', group_name: 'purchases' },
    { name: 'purchases.cancel', description: 'Cancelar facturas de compra', group_name: 'purchases' },
    { name: 'purchases.backdate', description: 'Consultar tasas de cambio de fechas anteriores para compras retroactivas', group_name: 'purchases' },

    // Ventas
    { name: 'sales.read', description: 'Leer facturas de venta', group_name: 'sales' },
    { name: 'sales.create', description: 'Crear facturas de venta', group_name: 'sales' },
    { name: 'sales.accept', description: 'Aceptar facturas de venta', group_name: 'sales' },
    { name: 'sales.cancel', description: 'Cancelar facturas de venta', group_name: 'sales' },
    { name: 'sales.paid', description: 'Marcar facturas de venta como pagadas/cobradas', group_name: 'sales' },
    { name: 'sales.backdate', description: 'Crear facturas de venta con fecha retroactiva', group_name: 'sales' },

    // Traslados
    { name: 'transfers.read', description: 'Leer traslados', group_name: 'transfers' },
    { name: 'transfers.create', description: 'Crear traslados', group_name: 'transfers' },
    { name: 'transfers.accept', description: 'Aceptar traslados', group_name: 'transfers' },
    { name: 'transfers.reject', description: 'Rechazar traslados', group_name: 'transfers' },

    // Reportes
    { name: 'reports.stock.read', description: 'Ver stock actual de almacenes', group_name: 'reports' },
    { name: 'reports.stock.valorized', description: 'Ver stock valorizado (con costos)', group_name: 'reports' },
    { name: 'reports.movements.read', description: 'Ver movimientos de inventario', group_name: 'reports' },
  ];

  for (const p of fixedPermissions) {
    await db.execute(sql`INSERT INTO permissions (name, description, group_name) VALUES (${p.name}, ${p.description}, ${p.group_name})`);
  }
  console.log("Permisos creados.");

  // Dar todos los permisos al rol admin
  await db.execute(sql`INSERT INTO role_permissions (role_id, permission_id)
                      SELECT ${adminRoleId}, p.id FROM permissions p`);
  console.log("Permisos asignados al rol admin.");

  // Seed de moneda base CUP (ID=1, no puede ser eliminada)
  await db.execute(sql`INSERT INTO currencies (name, code, symbol, decimal_places, is_active) VALUES 
    ('Peso Cubano', 'CUP', '₱', 2, TRUE)`);
  console.log("Moneda base CUP creada (ID=1).");

  // Seed de monedas adicionales
  await db.execute(sql`INSERT INTO currencies (name, code, symbol, decimal_places) VALUES 
    ('Dólar Estadounidense', 'USD', '$', 2),
    ('Euro', 'EUR', '€', 2)`);
  console.log("Monedas USD y EUR creadas.");

  // Seed de unidades de medida comunes
  const commonUnits = [
    { name: 'Unidad', short_name: 'u', description: 'Unidad individual', type: 'countable' },
    { name: 'Kilogramo', short_name: 'kg', description: 'Unidad de masa', type: 'weight' },
    { name: 'Gramo', short_name: 'g', description: 'Unidad de masa pequeña', type: 'weight' },
    { name: 'Litro', short_name: 'L', description: 'Unidad de volumen', type: 'volume' },
    { name: 'Mililitro', short_name: 'ml', description: 'Unidad de volumen pequeña', type: 'volume' },
    { name: 'Metro', short_name: 'm', description: 'Unidad de longitud', type: 'length' },
    { name: 'Centímetro', short_name: 'cm', description: 'Unidad de longitud pequeña', type: 'length' },
    { name: 'Caja', short_name: 'cja', description: 'Empaque en caja', type: 'package' },
    { name: 'Paquete', short_name: 'paq', description: 'Empaque en paquete', type: 'package' },
    { name: 'Docena', short_name: 'doc', description: 'Conjunto de 12 unidades', type: 'countable' },
    { name: 'Saco', short_name: 'sco', description: 'Empaque en saco', type: 'package' },
    { name: 'Bulto', short_name: 'bto', description: 'Empaque en bulto', type: 'package' },
  ];

  for (const unit of commonUnits) {
    await db.execute(sql`INSERT INTO units (name, short_name, description, type, is_active) 
      VALUES (${unit.name}, ${unit.short_name}, ${unit.description}, ${unit.type}, TRUE)`);
  }
  console.log("Unidades de medida comunes creadas.");

  // Seed de tipos de pago comunes
  const commonPaymentTypes = [
    { type: 'Efectivo', description: 'Pago en efectivo' },
    { type: 'Transferencia', description: 'Transferencia bancaria' },
    { type: 'Zelle', description: 'Pago por Zelle' },
  ];

  for (const payment of commonPaymentTypes) {
    await db.execute(sql`INSERT INTO payment_types (type, description, is_active) 
      VALUES (${payment.type}, ${payment.description}, TRUE)`);
  }
  console.log("Tipos de pago comunes creados.");

  console.log("\n✅ Migración completada exitosamente!");
  console.log("📊 Base de datos creada con sistema de inventario por lotes.");
  console.log("\n📝 Credenciales del administrador:");
  console.log("   Email: admin@sasinversus.com");
  console.log("   Password: Admin123");
  
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en la migración:", err);
  process.exit(1);
});
