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