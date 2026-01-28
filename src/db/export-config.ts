import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

/**
 * Script para exportar la configuración actual de la base de datos en formato SQL
 * 
 * INCLUYE (configuración):
 * - roles, permissions, role_permissions
 * - users, user_roles
 * - warehouses, user_warehouses
 * - units, currencies, exchange_rates
 * - categories, payment_types
 * - adjustment_types, expense_types
 * 
 * NO INCLUYE (datos transaccionales):
 * - products, inventory, inventory_lots, inventory_movements, lot_consumptions
 * - purchases, purchases_detail
 * - sales, sales_detail
 * - transfers, transfers_detail
 * - adjustments, adjustments_detail
 * - expenses
 * - refresh_tokens
 */

// Tablas de configuración a exportar (en orden de dependencias)
const CONFIG_TABLES = [
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'user_roles',
  'warehouses',
  'user_warehouses',
  'units',
  'currencies',
  'exchange_rates',
  'categories',
  'payment_types',
  'adjustment_types',
  'expense_types',
];

function escapeValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  }
  // Escapar strings
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `'${escaped}'`;
}

async function exportTable(connection: mysql.Connection, tableName: string): Promise<string> {
  const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\``) as [any[], any];
  
  if (rows.length === 0) {
    return `-- Tabla ${tableName}: sin datos\n`;
  }

  const columns = Object.keys(rows[0]);
  const columnList = columns.map(c => `\`${c}\``).join(', ');
  
  let sql = `-- ═══════════════════════════════════════════════════════════════\n`;
  sql += `-- Tabla: ${tableName} (${rows.length} registros)\n`;
  sql += `-- ═══════════════════════════════════════════════════════════════\n`;
  
  // Generar INSERT statements
  for (const row of rows) {
    const values = columns.map(col => escapeValue(row[col])).join(', ');
    sql += `INSERT INTO \`${tableName}\` (${columnList}) VALUES (${values});\n`;
  }
  
  sql += '\n';
  return sql;
}

async function main() {
  console.log('🔄 Conectando a la base de datos...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  console.log(`✅ Conectado a: ${process.env.DB_NAME}`);
  
  const timestamp = new Date().toISOString().slice(0, 10);
  let sqlContent = '';
  
  // Header
  sqlContent += `-- ═══════════════════════════════════════════════════════════════\n`;
  sqlContent += `-- EXPORTACIÓN DE CONFIGURACIÓN - ${process.env.DB_NAME}\n`;
  sqlContent += `-- Fecha: ${new Date().toISOString()}\n`;
  sqlContent += `-- ═══════════════════════════════════════════════════════════════\n\n`;
  sqlContent += `-- INSTRUCCIONES:\n`;
  sqlContent += `-- 1. Ejecutar migrate.ts para crear la base de datos vacía\n`;
  sqlContent += `-- 2. Ejecutar este script SQL para cargar la configuración\n`;
  sqlContent += `-- NOTA: Desactivar foreign key checks durante la importación\n\n`;
  sqlContent += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;
  
  // Truncate tables (en orden inverso para evitar problemas de FK)
  sqlContent += `-- Limpiar tablas antes de insertar\n`;
  for (const table of [...CONFIG_TABLES].reverse()) {
    sqlContent += `TRUNCATE TABLE \`${table}\`;\n`;
  }
  sqlContent += '\n';
  
  // Export each table
  console.log('\n📦 Exportando tablas de configuración...\n');
  
  for (const table of CONFIG_TABLES) {
    try {
      process.stdout.write(`  - ${table}... `);
      const tableSQL = await exportTable(connection, table);
      sqlContent += tableSQL;
      
      // Contar registros
      const [countResult] = await connection.execute(`SELECT COUNT(*) as count FROM \`${table}\``) as [any[], any];
      console.log(`✅ (${countResult[0].count} registros)`);
    } catch (error: any) {
      console.log(`⚠️ Error: ${error.message}`);
      sqlContent += `-- Error exportando ${table}: ${error.message}\n\n`;
    }
  }
  
  // Footer
  sqlContent += `\nSET FOREIGN_KEY_CHECKS = 1;\n`;
  sqlContent += `\n-- ═══════════════════════════════════════════════════════════════\n`;
  sqlContent += `-- FIN DE LA EXPORTACIÓN\n`;
  sqlContent += `-- ═══════════════════════════════════════════════════════════════\n`;
  
  // Guardar archivo
  const outputDir = path.join(__dirname, '..', '..', 'sql');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `config-backup-${timestamp}.sql`);
  fs.writeFileSync(outputFile, sqlContent, 'utf8');
  
  console.log(`\n✅ Exportación completada!`);
  console.log(`📁 Archivo guardado en: ${outputFile}`);
  
  await connection.end();
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
