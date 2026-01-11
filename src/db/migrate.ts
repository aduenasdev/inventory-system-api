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

  // 4. Crear todas las tablas
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
      type VARCHAR(50) NOT NULL,
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
      rate DECIMAL(18, 6) NOT NULL,
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
    CREATE TABLE products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      code VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      cost_price DECIMAL(18, 2),
      sale_price DECIMAL(18, 2),
      currency_id INT NOT NULL,
      unit_id INT NOT NULL,
      category_id INT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (currency_id) REFERENCES currencies(id),
      FOREIGN KEY (unit_id) REFERENCES units(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
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

  await db.execute(sql`
    CREATE TABLE inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      warehouse_id INT NOT NULL,
      product_id INT NOT NULL,
      current_quantity DECIMAL(18, 2) NOT NULL DEFAULT 0,
      UNIQUE KEY unique_warehouse_product (warehouse_id, product_id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE inventory_movements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type ENUM('INVOICE_ENTRY', 'SALE_EXIT', 'TRANSFER_ENTRY', 'TRANSFER_EXIT', 'ADJUSTMENT_ENTRY', 'ADJUSTMENT_EXIT') NOT NULL,
      status ENUM('PENDING', 'APPROVED', 'CANCELLED') NOT NULL,
      warehouse_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(18, 2) NOT NULL,
      reference VARCHAR(255),
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

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
      exchange_rate_used DECIMAL(18, 6),
      converted_unit_cost DECIMAL(18, 2),
      subtotal DECIMAL(18, 2) NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (original_currency_id) REFERENCES currencies(id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE sales (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number VARCHAR(50) NOT NULL UNIQUE,
      customer_name VARCHAR(255),
      customer_phone VARCHAR(50),
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
    CREATE TABLE sales_detail (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sale_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity DECIMAL(18, 2) NOT NULL,
      unit_price DECIMAL(18, 2) NOT NULL,
      payment_type_id INT NOT NULL,
      original_currency_id INT,
      exchange_rate_used DECIMAL(18, 6),
      converted_unit_price DECIMAL(18, 2),
      subtotal DECIMAL(18, 2) NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (payment_type_id) REFERENCES payment_types(id),
      FOREIGN KEY (original_currency_id) REFERENCES currencies(id)
    )
  `);

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
      accepted_by INT,
      rejected_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      accepted_at TIMESTAMP NULL,
      rejected_at TIMESTAMP NULL,
      FOREIGN KEY (origin_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (destination_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (accepted_by) REFERENCES users(id),
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

  console.log("Todas las tablas creadas exitosamente.");

  // 5. Seed de datos

  // Crear rol de administrador
  const [adminRoleResult] = (await db.execute(
    sql`INSERT INTO roles (name, description) VALUES ('admin', 'Administrador con todos los privilegios')`
  )) as any[];
  const adminRoleId = adminRoleResult.insertId;
  console.log("Rol 'admin' creado.");

  // Crear usuario administrador
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const [adminUserResult] = (await db.execute(
    sql`INSERT INTO users (email, password, nombre) VALUES (${"admin@example.com"}, ${hashedPassword}, ${"Admin"})`
  )) as any[];
  const adminUserId = adminUserResult.insertId;
  console.log("Usuario 'admin@example.com' creado.");

  // Asociar usuario admin con rol admin
  await db.execute(sql`INSERT INTO user_roles (user_id, role_id) VALUES (${adminUserId}, ${adminRoleId})`);

  // Poblar permisos fijos
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

    // CRUD tipos de pago
    { name: 'payment_types.read', description: 'Leer tipos de pago', group_name: 'payment_types' },
    { name: 'payment_types.create', description: 'Crear tipos de pago', group_name: 'payment_types' },
    { name: 'payment_types.update', description: 'Actualizar tipos de pago', group_name: 'payment_types' },
    { name: 'payment_types.delete', description: 'Eliminar tipos de pago', group_name: 'payment_types' },

    // Inventario
    { name: 'inventory.read', description: 'Consultar inventario', group_name: 'inventory' },
    { name: 'inventory.adjustments.create', description: 'Crear ajustes de inventario', group_name: 'inventory' },
    { name: 'inventory.adjustments.approve', description: 'Aprobar ajustes de inventario', group_name: 'inventory' },

    // Compras
    { name: 'purchases.read', description: 'Leer facturas de compra', group_name: 'purchases' },
    { name: 'purchases.create', description: 'Crear facturas de compra', group_name: 'purchases' },
    { name: 'purchases.accept', description: 'Aceptar facturas de compra', group_name: 'purchases' },
    { name: 'purchases.cancel', description: 'Cancelar facturas de compra', group_name: 'purchases' },

    // Ventas
    { name: 'sales.read', description: 'Leer facturas de venta', group_name: 'sales' },
    { name: 'sales.create', description: 'Crear facturas de venta', group_name: 'sales' },
    { name: 'sales.accept', description: 'Aceptar facturas de venta', group_name: 'sales' },
    { name: 'sales.cancel', description: 'Cancelar facturas de venta', group_name: 'sales' },

    // Traslados
    { name: 'transfers.read', description: 'Leer traslados', group_name: 'transfers' },
    { name: 'transfers.create', description: 'Crear traslados', group_name: 'transfers' },
    { name: 'transfers.accept', description: 'Aceptar traslados', group_name: 'transfers' },
    { name: 'transfers.reject', description: 'Rechazar traslados', group_name: 'transfers' },
  ];

  for (const p of fixedPermissions) {
    await db.execute(sql`INSERT INTO permissions (name, description, group_name) VALUES (${p.name}, ${p.description}, ${p.group_name})`);
  }
  console.log("Permisos creados.");

  // Dar todos los permisos al rol admin
  await db.execute(sql`INSERT INTO role_permissions (role_id, permission_id)
                      SELECT ${adminRoleId}, p.id FROM permissions p`);
  console.log("Permisos asignados al rol admin.");

  // Seeds de monedas comunes (USD y CUP)
  await db.execute(sql`INSERT INTO currencies (name, code, symbol, decimal_places) VALUES 
    ('Dólar Estadounidense', 'USD', '$', 2),
    ('Peso Cubano', 'CUP', '$', 2)`);
  console.log("Monedas USD y CUP creadas.");

  console.log("\n✅ Migración completada exitosamente!");
  console.log("📊 Base de datos creada desde cero con todas las tablas y datos iniciales.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en la migración o seed:", err);
  process.exit(1);
});

