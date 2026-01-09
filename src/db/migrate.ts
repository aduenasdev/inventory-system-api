import { db } from "./connection";
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";

async function main() {
  // Crear tablas si no existen
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL UNIQUE,
      description TEXT
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      group_name VARCHAR(50) NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INT NOT NULL,
      permission_id INT NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (permission_id) REFERENCES permissions(id)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INT NOT NULL,
      role_id INT NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token VARCHAR(255) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS warehouses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      provincia VARCHAR(100) NOT NULL,
      municipio VARCHAR(100) NOT NULL,
      direccion TEXT,
      ubicacion VARCHAR(255)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_warehouses (
      user_id INT NOT NULL,
      warehouse_id INT NOT NULL,
      PRIMARY KEY (user_id, warehouse_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
    )
  `);

  console.log("Tablas verificadas/creadas.");

  // --- Seed de datos ---

  // 1. Crear rol de administrador si no existe
  const [adminRole] = (await db.execute(
    sql`SELECT id FROM roles WHERE name = 'admin'`
  )) as any[];

  let adminRoleId;
  if (!Array.isArray(adminRole) || adminRole.length === 0) {
    const [result] = (await db.execute(
      sql`INSERT INTO roles (name, description) VALUES ('admin', 'Administrador con todos los privilegios')`
    )) as any[];
    adminRoleId = result.insertId;
    console.log("Rol 'admin' creado.");
  } else {
    adminRoleId = adminRole[0].id;
  }

  // 1b. Crear rol de usuario si no existe
  const [userRole] = (await db.execute(
    sql`SELECT id FROM roles WHERE name = 'user'`
  )) as any[];
  let userRoleId;
  if (!Array.isArray(userRole) || userRole.length === 0) {
    const [result] = (await db.execute(
      sql`INSERT INTO roles (name, description) VALUES ('user', 'Rol base para usuarios')`
    )) as any[];
    userRoleId = result.insertId;
    console.log("Rol 'user' creado.");
  } else {
    userRoleId = userRole[0].id;
  }

  // 2. Crear usuario administrador si no existe
  const [adminUser] = (await db.execute(
    sql`SELECT id FROM users WHERE email = 'admin@example.com'`
  )) as any[];

  if (!Array.isArray(adminUser) || adminUser.length === 0) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await db.execute(
      sql`INSERT INTO users (email, password) VALUES (${"admin@example.com"}, ${hashedPassword})`
    );
    // Map admin user to admin role in user_roles pivot
    const [newAdmin] = (await db.execute(sql`SELECT id FROM users WHERE email = 'admin@example.com'`)) as any[];
    const adminId = newAdmin[0]?.id;
    if (adminId) {
      await db.execute(sql`INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (${adminId}, ${adminRoleId})`);
    }
    console.log("Usuario 'admin@example.com' creado.");
  }

  // 3. Poblar permisos fijos (CRUD usuarios + crear warehouses)
  const fixedPermissions = [
     //adicuinar crud a users
    { name: 'users.read', description: 'Leer usuarios', group_name: 'users' },
    { name: 'users.create', description: 'Crear usuarios', group_name: 'users' },
    { name: 'users.update', description: 'Actualizar usuarios', group_name: 'users' },
    { name: 'users.delete', description: 'Eliminar usuarios', group_name: 'users' },
    { name: 'users.roles.associate', description: 'Asociar roles a usuarios', group_name: 'users' },
    { name: 'users.warehouses.associate', description: 'Asociar usuarios a almacenes', group_name: 'users' },

   //adicuinar crud a warehouses
    { name: 'warehouses.read', description: 'Leer almacenes', group_name: 'warehouses' },
    { name: 'warehouses.create', description: 'Crear almacenes', group_name: 'warehouses' },
    { name: 'warehouses.update', description: 'Actualizar almacenes', group_name: 'warehouses' },
    { name: 'warehouses.delete', description: 'Eliminar almacenes', group_name: 'warehouses' },
  
    //adicuinar crud a roles
    { name: 'roles.read', description: 'Leer roles', group_name: 'roles' },
    { name: 'roles.create', description: 'Crear roles', group_name: 'roles' },
    { name: 'roles.update', description: 'Actualizar roles', group_name: 'roles' },
    { name: 'roles.delete', description: 'Eliminar roles', group_name: 'roles' },
   
    /*permisos adicionales pueden agregarse aquí*/

  ];

  for (const p of fixedPermissions) {
    await db.execute(sql`INSERT IGNORE INTO permissions (name, description, group_name) VALUES (${p.name}, ${p.description}, ${p.group_name})`);
  }

  // 4. Dar todos los permisos fijos al rol admin
  await db.execute(sql`INSERT IGNORE INTO role_permissions (role_id, permission_id)
                      SELECT ${adminRoleId}, p.id FROM permissions p WHERE p.name IN ('users.read','users.create','users.update','users.delete','warehouses.read','warehouses.create','warehouses.update','warehouses.delete','roles.read','roles.create','roles.update','roles.delete')`);

  console.log("Seed de datos completado!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en la migración o seed:", err);
  process.exit(1);
});

