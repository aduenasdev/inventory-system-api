# Inventory System API — Módulos y despliegue

Este README resume, módulo por módulo, lo que implementa la aplicación, más instrucciones de despliegue y las credenciales iniciales que crea el script de migración.


Comportamientos importantes aplicados en código

- Validaciones con `zod` en cada módulo (`create` / `update`).
- Mensajes de error uniformes: controladores retornan `{ message: string }` y códigos 400/404/500 según el caso.
- Reglas de negocio: antes de deshabilitar/eliminar recursos relacionados con productos (categorías, unidades) se comprueba existencia de productos asociados y se bloquea la operación.

Despliegue y configuración

1) Instalar dependencias:

```bash
npm install
```

2) Variables de entorno mínimas (archivo `.env` en la raíz):

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=inventory
JWT_SECRET=tu_secreto_super_seguro
JWT_REFRESH_SECRET=otro_secreto_diferente
```

3) Crear base de datos y ejecutar migraciones/seeds (el script `src/db/migrate.ts` crea todas las tablas y semillas iniciales):

```bash
# Ejecutar migraciones y seeds
npm run migrate
```

4) Iniciar servidor:

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

## Migración de Configuración

El sistema incluye un script para exportar la configuración actual y restaurarla después de una migración. Esto es útil cuando necesitas actualizar la estructura de la base de datos sin perder la configuración existente.

### ¿Qué se exporta?

**INCLUYE (configuración):**
- `roles`, `permissions`, `role_permissions`
- `users`, `user_roles`
- `warehouses`, `user_warehouses`
- `units`, `currencies`, `exchange_rates`
- `categories`, `payment_types`
- `adjustment_types`, `expense_types`

**NO INCLUYE (datos transaccionales):**
- `products`, `inventory`, `inventory_lots`, `inventory_movements`
- `purchases`, `purchases_detail`
- `sales`, `sales_detail`
- `transfers`, `transfers_detail`
- `adjustments`, `adjustments_detail`
- `expenses`

### Proceso de migración

```bash
# 1. Exportar configuración actual (genera archivo en /sql)
npm run export-config

# 2. Recrear base de datos con nueva estructura
npm run migrate

# 3. Restaurar configuración exportada
mysql -u root -p inventory < sql/config-backup-YYYY-MM-DD.sql
```

### Archivos generados

Los backups se guardan en la carpeta `sql/` con el formato:
```
sql/config-backup-2026-01-28.sql
```

### Notas importantes

- El script desactiva `FOREIGN_KEY_CHECKS` durante la importación
- Las tablas se limpian (TRUNCATE) antes de insertar para evitar duplicados
- Los IDs se preservan exactamente como estaban