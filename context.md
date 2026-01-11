# Inventory System API — Contexto Completo

## 📚 Navegación de Documentación

- 📖 **[README.md](README.md)** - Visión general, instalación y arquitectura
- 🔧 **[context.md](context.md)** - Documentación técnica completa con ejemplos CURL (estás aquí)
- 🎨 **[FRONTEND-INTEGRATION.md](FRONTEND-INTEGRATION.md)** - Guía de integración con frontend
- 📊 **[REPORTES.md](REPORTES.md)** - Documentación de reportes y analytics

---

Este documento resume la configuración, estructura, endpoints y la lógica de negocio del backend. Sirve como referencia central para mantenimiento y evolución del proyecto.

## Stack y Configuración
- Lenguaje: TypeScript
- Framework: Express
- ORM: Drizzle ORM (MySQL)
- DB Driver: mysql2/promise
- Seguridad: JWT (access + refresh), bcrypt, helmet, cors
- Validación: zod
- Logging: morgan

## Estructura de carpetas
```
.
├─ LICENSE
├─ package.json
├─ README.md
├─ tsconfig.json
├─ .env / .env.example
├─ src/
│  ├─ app.ts
│  ├─ server.ts
│  ├─ utils/
│  │  └─ jwt.ts
│  ├─ middlewares/
│  │  ├─ auth.middleware.ts
│  │  ├─ authorization.middleware.ts
│  │  └─ validate.ts
│  ├─ db/
│  │  ├─ connection.ts
│  │  ├─ migrate.ts
│  │  └─ schema/
│  │     ├─ index.ts
│  │     ├─ users.ts
│  │     ├─ roles.ts
│  │     ├─ permissions.ts
│  │     ├─ role_permissions.ts
│  │     ├─ user_roles.ts
│  │     ├─ refresh_tokens.ts
│  │     ├─ warehouses.ts
│  │     ├─ user_warehouses.ts
│  │     ├─ units.ts
│  │     ├─ currencies.ts
│  │     ├─ exchange_rates.ts
│  │     ├─ categories.ts
│  │     ├─ products.ts
│  │     └─ payment_types.ts
│  └─ modules/
│     ├─ auth/
│     │  ├─ auth.routes.ts
│     │  ├─ auth.controller.ts
│     │  ├─ auth.service.ts
│     │  └─ auth.schemas.ts
│     ├─ users/
│     │  ├─ users.routes.ts
│     │  ├─ users.controller.ts
│     │  ├─ users.service.ts
│     │  └─ users.schemas.ts
│     ├─ roles/
│     │  ├─ roles.routes.ts
│     │  ├─ roles.controller.ts
│     │  ├─ roles.service.ts
│     │  └─ roles.schemas.ts
│     ├─ permissions/
│     │  ├─ permissions.routes.ts
│     │  ├─ permissions.controller.ts
│     │  └─ permissions.service.ts
│     ├─ warehouses/
│     │  ├─ warehouses.routes.ts
│     │  ├─ warehouses.controller.ts
│     │  ├─ warehouses.service.ts
│     │  └─ warehouses.schemas.ts
│     ├─ units/
│     │  ├─ units.routes.ts
│     │  ├─ units.controller.ts
│     │  ├─ units.service.ts
│     │  └─ units.schemas.ts
│     ├─ currencies/
│     │  ├─ currencies.routes.ts
│     │  ├─ currencies.controller.ts
│     │  ├─ currencies.service.ts
│     │  └─ currencies.schemas.ts
│     ├─ exchange_rates/
│     │  ├─ exchange_rates.routes.ts
│     │  ├─ exchange_rates.controller.ts
│     │  ├─ exchange_rates.service.ts
│     │  └─ exchange_rates.schemas.ts
│     ├─ categories/
│     │  ├─ categories.routes.ts
│     │  ├─ categories.controller.ts
│     │  ├─ categories.service.ts
│     │  └─ categories.schemas.ts
│     ├─ products/
│     │  ├─ products.routes.ts
│     │  ├─ products.controller.ts
│     │  ├─ products.service.ts
│     │  └─ products.schemas.ts
│     └─ payment_types/
│        ├─ payment_types.routes.ts
│        ├─ payment_types.controller.ts
│        ├─ payment_types.service.ts
│        └─ payment_types.schemas.ts
```

## Variables de entorno (.env)
- `PORT`: Puerto del servidor (ej: 3000)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Configuración MySQL
- `JWT_SECRET`: Secreto para Access Token
- `JWT_REFRESH_SECRET`: Secreto para Refresh Token

## Arranque
- Desarrollo: `npm run dev`
- Migración/seeds: ejecutar `migrate.ts` (se corre en arranque si está configurado en el proceso o manualmente).

---

## Aplicación y Servidor
- [src/app.ts](src/app.ts)
  - Configura middlewares globales: `helmet`, `cors`, `express.json`, `morgan`.
  - Monta routers:
    - `/auth` → Auth
    - `/roles` → Roles
    - `/permissions` → Permisos
    - `/users` → Usuarios
    - `/warehouses` → Almacenes
  - Salud: `GET /health`.
- [src/server.ts](src/server.ts)
  - Levanta Express en `PORT`.

---

## Middlewares
- [src/middlewares/auth.middleware.ts](src/middlewares/auth.middleware.ts)
  - Valida `Authorization: Bearer <token>` usando `JWT_SECRET`.
  - Carga `res.locals.user` con `{ id, email, roles: string[], permissions: string[] }`.
    - `roles` se obtienen desde `user_roles` → `roles`.
    - `permissions` se resuelven vía `role_permissions` → `permissions`.
- [src/middlewares/authorization.middleware.ts](src/middlewares/authorization.middleware.ts)
  - `isRole("admin")`: exige que el usuario tenga alguno de los roles indicados (por nombre).
  - `hasPermission("users.read")`: exige que el usuario tenga el permiso indicado (lista plana en `res.locals.user.permissions`).
- [src/middlewares/validate.ts](src/middlewares/validate.ts)
  - Aplica esquemas de zod a `req.body` y retorna 400 si son inválidos.

---

## Base de Datos
- [src/db/connection.ts](src/db/connection.ts)
  - Crea pool MySQL y el cliente Drizzle.
- [src/db/migrate.ts](src/db/migrate.ts)
  - Crea tablas: `users`, `roles`, `permissions`, `warehouses`, pivotes `role_permissions`, `user_roles`, `user_warehouses`, y `refresh_tokens`.
  - Constraints: `UNIQUE` en `users.email`, `roles.name`, `permissions.name`; FKs con `CASCADE`.
  - Seeds:
    - Roles fijos: `admin`, `user` (si no existen).
    - Usuario admin (admin@example.com/admin123) y lo asigna al rol `admin`.
    - Permisos estandarizados: users (CRUD), warehouses (CRUD), roles (CRUD), asociaciones.
    - Asigna todos los permisos al rol `admin`.
- Esquemas (Drizzle):
  - [src/db/schema/users.ts](src/db/schema/users.ts): `id`, `email`, `password`, `nombre`, `apellido`, `telefono`, `enabled`, `createdAt`, `lastLogin`.
  - [src/db/schema/roles.ts](src/db/schema/roles.ts): `id`, `name` (único), `description`.
  - [src/db/schema/permissions.ts](src/db/schema/permissions.ts): `id`, `name` (único), `description`, `group_name`.
  - [src/db/schema/warehouses.ts](src/db/schema/warehouses.ts): `id`, `name`, `provincia`, `municipio`, `direccion`, `ubicacion`.
  - [src/db/schema/role_permissions.ts](src/db/schema/role_permissions.ts): pivote (roleId, permissionId) con PK compuesta.
  - [src/db/schema/user_roles.ts](src/db/schema/user_roles.ts): pivote (userId, roleId) con PK compuesta.
  - [src/db/schema/user_warehouses.ts](src/db/schema/user_warehouses.ts): pivote (userId, warehouseId) con PK compuesta.
  - [src/db/schema/refresh_tokens.ts](src/db/schema/refresh_tokens.ts): `id`, `token` (único), `userId`, `expiresAt`.
  - [src/db/schema/index.ts](src/db/schema/index.ts): exporta todos los esquemas.

---

## Utils
- [src/utils/jwt.ts](src/utils/jwt.ts)
  - `generateTokens({ userId })`: genera `accessToken` (≈15m) y `refreshToken` (≈7d).

---

## Módulos y Endpoints

### Auth
- Router: [src/modules/auth/auth.routes.ts](src/modules/auth/auth.routes.ts)
- Controller: [src/modules/auth/auth.controller.ts](src/modules/auth/auth.controller.ts)
- Service: [src/modules/auth/auth.service.ts](src/modules/auth/auth.service.ts)
- Schemas: [src/modules/auth/auth.schemas.ts](src/modules/auth/auth.schemas.ts)

#### `POST /auth/login` (público)
Inicia sesión, valida que el usuario esté habilitado y actualiza `lastLogin`.
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```
**Respuesta:**
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "telefono": "809-555-0100"
  },
  "roles": ["admin", "manager"],
  "permissions": [
    "users.read",
    "users.create",
    "users.update",
    "users.delete",
    "warehouses.read",
    "warehouses.create",
    "roles.read",
    "categories.read",
    "..."
  ]
}
```

**Errores posibles:**
- 400: "Usuario deshabilitado. Contacte al administrador" (si `enabled = false`)
- 401: "Invalid email or password"

#### `POST /auth/refresh` (público)
Rota el refresh token.
```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGc..."
  }'
```
**Respuesta:**
```json
{
  "message": "Tokens refreshed successfully",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

#### `GET /auth/me` (privado)
Obtiene información del usuario autenticado.
```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer eyJhbGc..."
```
**Respuesta:**
```json
{
  "id": 1,
  "email": "admin@example.com",
  "roles": ["admin"],
  "permissions": ["users.read", "users.create", "users.update", "users.delete", "warehouses.read", "warehouses.create", "warehouses.update", "warehouses.delete", "roles.read", "roles.create", "roles.update", "roles.delete", "users.roles.associate", "users.warehouses.associate"]
}
```

#### `PUT /auth/change-password` (privado, sin permisos especiales)
Permite que cualquier usuario autenticado cambie su propia contraseña sin necesitar permisos de administrador.
```bash
curl -X PUT http://localhost:3000/auth/change-password \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "password123",
    "newPassword": "NewSecure456"
  }'
```
**Validaciones:**
- `currentPassword`: Requerida, debe coincidir con la contraseña actual del usuario
- `newPassword`: Mínimo 6 caracteres, al menos 1 mayúscula, 1 minúscula, 1 número

**Respuesta:**
```json
{
  "message": "Contraseña actualizada exitosamente"
}
```

**Nota importante**: Este endpoint es para que los usuarios cambien su propia contraseña. Para que un administrador cambie la contraseña de otro usuario, usar `PUT /users/:id` con el permiso `users.update`.

---

### Users
- Router: [src/modules/users/users.routes.ts](src/modules/users/users.routes.ts)
- Controller: [src/modules/users/users.controller.ts](src/modules/users/users.controller.ts)
- Service: [src/modules/users/users.service.ts](src/modules/users/users.service.ts)
- Schemas: [src/modules/users/users.schemas.ts](src/modules/users/users.schemas.ts)

#### `POST /users` → `hasPermission("users.create")`
Crea un usuario con nombre, roles y warehouses opcionales. El usuario se crea habilitado por defecto.
```bash
curl -X POST http://localhost:3000/users \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "nombre": "Juan",
    "apellido": "Pérez",
    "telefono": "809-555-0100",
    "roleIds": [2],
    "warehouseIds": [1, 2]
  }'
```
**Validaciones:**
- nombre: requerido
- apellido, telefono: opcionales
- enabled: se establece en true por defecto

**Respuesta:**
```json
{
  "id": 2,
  "email": "user@example.com"
}
```

#### `GET /users` → `hasPermission("users.read")`
Lista todos los usuarios.
```bash
curl -X GET http://localhost:3000/users \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /users/:userId` → `hasPermission("users.read")`
Obtiene un usuario por ID.
```bash
curl -X GET http://localhost:3000/users/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `PUT /users/:userId` → `hasPermission("users.update")`
Actualiza información de un usuario (email, password, nombre, apellido, telefono).
```bash
curl -X PUT http://localhost:3000/users/2 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com",
    "password": "newpassword123",
    "nombre": "Juan Carlos",
    "apellido": "Rodríguez",
    "telefono": "829-555-0200"
  }'
```
**Nota**: Todos los campos son opcionales. Para habilitar/deshabilitar usar los endpoints específicos.
```

#### `PUT /users/:userId/disable` → `hasPermission("users.delete")`
Deshabilita un usuario (soft delete). El usuario no podrá hacer login pero se mantiene en BD.
```bash
curl -X PUT http://localhost:3000/users/2/disable \
  -H "Authorization: Bearer eyJhbGc..."
```
**Respuesta:**
```json
{
  "message": "Usuario deshabilitado"
}
```

#### `PUT /users/:userId/enable` → `hasPermission("users.update")`
Habilita un usuario previamente deshabilitado.
```bash
curl -X PUT http://localhost:3000/users/2/enable \
  -H "Authorization: Bearer eyJhbGc..."
```
**Respuesta:**
```json
{
  "message": "Usuario habilitado"
}
```

#### `POST /users/:userId/roles` → `isRole("admin")`
Asigna un rol a un usuario.
```bash
curl -X POST http://localhost:3000/users/2/roles \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "roleId": 1
  }'
```

#### `DELETE /users/:userId/roles/:roleId` → `isRole("admin")`
Remueve un rol de un usuario.
```bash
curl -X DELETE http://localhost:3000/users/2/roles/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

---

### Roles
- Router: [src/modules/roles/roles.routes.ts](src/modules/roles/roles.routes.ts)
- Controller: [src/modules/roles/roles.controller.ts](src/modules/roles/roles.controller.ts)
- Service: [src/modules/roles/roles.service.ts](src/modules/roles/roles.service.ts)
- Schemas: [src/modules/roles/roles.schemas.ts](src/modules/roles/roles.schemas.ts)

#### `GET /roles` → `hasPermission("roles.read")`
Lista todos los roles.
```bash
curl -X GET http://localhost:3000/roles \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /roles/:roleId` → `hasPermission("roles.read")`
Obtiene un rol por ID.
```bash
curl -X GET http://localhost:3000/roles/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /roles` → `hasPermission("roles.create")`
Crea un nuevo rol.
```bash
curl -X POST http://localhost:3000/roles \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "manager",
    "description": "Manager role with limited permissions"
  }'
```

#### `PUT /roles/:roleId` → `hasPermission("roles.update")`
Actualiza un rol.
```bash
curl -X PUT http://localhost:3000/roles/3 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "supervisor",
    "description": "Updated description"
  }'
```

#### `DELETE /roles/:roleId` → `hasPermission("roles.delete")`
Elimina un rol (solo si no está asignado a usuarios).
```bash
curl -X DELETE http://localhost:3000/roles/3 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /roles/:roleId/permissions` → `hasPermission("roles.read")`
Lista los permisos de un rol.
```bash
curl -X GET http://localhost:3000/roles/1/permissions \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /roles/:roleId/permissions` → `hasPermission("roles.update")`
Asigna un permiso a un rol.
```bash
curl -X POST http://localhost:3000/roles/2/permissions \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "permissionId": 5
  }'
```

---

### Permissions
- Router: [src/modules/permissions/permissions.routes.ts](src/modules/permissions/permissions.routes.ts)
- Controller: [src/modules/permissions/permissions.controller.ts](src/modules/permissions/permissions.controller.ts)
- Service: [src/modules/permissions/permissions.service.ts](src/modules/permissions/permissions.service.ts)

#### `GET /permissions` (privado - solo autenticación)
Lista todos los permisos disponibles.
```bash
curl -X GET http://localhost:3000/permissions \
  -H "Authorization: Bearer eyJhbGc..."
```
**Respuesta:**
```json
[
  {
    "id": 1,
    "name": "users.read",
    "description": "Leer usuarios",
    "group": "users"
  },
  {
    "id": 2,
    "name": "users.create",
    "description": "Crear usuarios",
    "group": "users"
  }
]
```

---

### Warehouses
- Router: [src/modules/warehouses/warehouses.routes.ts](src/modules/warehouses/warehouses.routes.ts)
- Controller: [src/modules/warehouses/warehouses.controller.ts](src/modules/warehouses/warehouses.controller.ts)
- Service: [src/modules/warehouses/warehouses.service.ts](src/modules/warehouses/warehouses.service.ts)
- Schemas: [src/modules/warehouses/warehouses.schemas.ts](src/modules/warehouses/warehouses.schemas.ts)

#### `POST /warehouses` → `hasPermission("warehouses.create")`
Crea un nuevo almacén.
```bash
curl -X POST http://localhost:3000/warehouses \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Almacén Central",
    "provincia": "La Habana",
    "municipio": "Plaza de la Revolución",
    "direccion": "Calle 23 #456",
    "ubicacion": "23.1136,-82.3666"
  }'
```
**Respuesta:**
```json
{
  "id": 1,
  "name": "Almacén Central",
  "provincia": "La Habana",
  "municipio": "Plaza de la Revolución",
  "direccion": "Calle 23 #456",
  "ubicacion": "23.1136,-82.3666"
}
```

#### `GET /warehouses` → `hasPermission("warehouses.read")`
Lista todos los almacenes.
```bash
curl -X GET http://localhost:3000/warehouses \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /warehouses/:warehouseId` → `hasPermission("warehouses.read")`
Obtiene un almacén por ID.
```bash
curl -X GET http://localhost:3000/warehouses/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `PUT /warehouses/:warehouseId` → `hasPermission("warehouses.update")`
Actualiza un almacén.
```bash
curl -X PUT http://localhost:3000/warehouses/1 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Almacén Central Actualizado",
    "direccion": "Nueva dirección 789"
  }'
```

#### `DELETE /warehouses/:warehouseId` → `hasPermission("warehouses.delete")`
Elimina un almacén (cascade elimina asociaciones).
```bash
curl -X DELETE http://localhost:3000/warehouses/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /warehouses/:warehouseId/users` → `hasPermission("users.warehouses.associate")`
Asocia un usuario a un almacén.
```bash
curl -X POST http://localhost:3000/warehouses/1/users \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 2
  }'
```

#### `DELETE /warehouses/:warehouseId/users/:userId` → `hasPermission("users.warehouses.associate")`
Remueve un usuario de un almacén.
```bash
curl -X DELETE http://localhost:3000/warehouses/1/users/2 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /warehouses/:warehouseId/users` → `hasPermission("warehouses.read")`
Lista los usuarios asociados a un almacén.
```bash
curl -X GET http://localhost:3000/warehouses/1/users \
  -H "Authorization: Bearer eyJhbGc..."
```
**Respuesta:**
```json
[
  {
    "id": 2,
    "email": "user@example.com",
    "createdAt": "2026-01-09T10:30:00.000Z",
    "lastLogin": "2026-01-09T14:25:00.000Z"
  }
]
```

---

## Units (Unidades de Medida)
- Router: [src/modules/units/units.routes.ts](src/modules/units/units.routes.ts)
- Controller: [src/modules/units/units.controller.ts](src/modules/units/units.controller.ts)
- Service: [src/modules/units/units.service.ts](src/modules/units/units.service.ts)
- Schemas: [src/modules/units/units.schemas.ts](src/modules/units/units.schemas.ts)

#### `GET /units` → `hasPermission("units.read")`
Lista todas las unidades de medida activas.
```bash
curl -X GET http://localhost:3000/units \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /units/:id` → `hasPermission("units.read")`
Obtiene una unidad por ID.
```bash
curl -X GET http://localhost:3000/units/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /units` → `hasPermission("units.create")`
Crea una nueva unidad de medida.
```bash
curl -X POST http://localhost:3000/units \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kilogramo",
    "shortName": "kg",
    "description": "Unidad de masa del SI",
    "type": "weight"
  }'
```

#### `PUT /units/:id` → `hasPermission("units.update")`
Actualiza una unidad existente.
```bash
curl -X PUT http://localhost:3000/units/1 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Unidad de masa del Sistema Internacional"
  }'
```

#### `PUT /units/:id/disable` → `hasPermission("units.delete")`
Deshabilita una unidad (soft delete).
```bash
curl -X PUT http://localhost:3000/units/1/disable \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `PUT /units/:id/enable` → `hasPermission("units.update")`
Habilita una unidad previamente deshabilitada.
```bash
curl -X PUT http://localhost:3000/units/1/enable \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Currencies (Monedas)
- Router: [src/modules/currencies/currencies.routes.ts](src/modules/currencies/currencies.routes.ts)
- Controller: [src/modules/currencies/currencies.controller.ts](src/modules/currencies/currencies.controller.ts)
- Service: [src/modules/currencies/currencies.service.ts](src/modules/currencies/currencies.service.ts)
- Schemas: [src/modules/currencies/currencies.schemas.ts](src/modules/currencies/currencies.schemas.ts)

#### `GET /currencies` → `hasPermission("currencies.read")`
Lista todas las monedas activas. Seeds: USD y CUP (Peso Cubano).
```bash
curl -X GET http://localhost:3000/currencies \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /currencies/:id` → `hasPermission("currencies.read")`
Obtiene una moneda por ID.
```bash
curl -X GET http://localhost:3000/currencies/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /currencies` → `hasPermission("currencies.create")`
Crea una nueva moneda.
```bash
curl -X POST http://localhost:3000/currencies \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Euro",
    "code": "EUR",
    "symbol": "€",
    "decimalPlaces": 2
  }'
```

#### `PUT /currencies/:id` → `hasPermission("currencies.update")`
Actualiza una moneda existente.
```bash
curl -X PUT http://localhost:3000/currencies/1 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "US$"
  }'
```

#### `PUT /currencies/:id/disable` → `hasPermission("currencies.delete")`
Deshabilita una moneda (soft delete).
```bash
curl -X PUT http://localhost:3000/currencies/1/disable \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `PUT /currencies/:id/enable` → `hasPermission("currencies.update")`
Habilita una moneda previamente deshabilitada.
```bash
curl -X PUT http://localhost:3000/currencies/1/enable \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Exchange Rates (Tasas de Cambio)
- Router: [src/modules/exchange_rates/exchange_rates.routes.ts](src/modules/exchange_rates/exchange_rates.routes.ts)
- Controller: [src/modules/exchange_rates/exchange_rates.controller.ts](src/modules/exchange_rates/exchange_rates.controller.ts)
- Service: [src/modules/exchange_rates/exchange_rates.service.ts](src/modules/exchange_rates/exchange_rates.service.ts)
- Schemas: [src/modules/exchange_rates/exchange_rates.schemas.ts](src/modules/exchange_rates/exchange_rates.schemas.ts)

#### `GET /exchange-rates` → `hasPermission("exchange_rates.read")`
Lista todas las tasas de cambio.
```bash
curl -X GET http://localhost:3000/exchange-rates \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /exchange-rates/:id` → `hasPermission("exchange_rates.read")`
Obtiene una tasa de cambio por ID.
```bash
curl -X GET http://localhost:3000/exchange-rates/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /exchange-rates/latest/:from/:to` → `hasPermission("exchange_rates.read")`
Obtiene la última tasa de cambio entre dos monedas.
```bash
curl -X GET http://localhost:3000/exchange-rates/latest/1/2 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /exchange-rates` → `hasPermission("exchange_rates.create")`
Crea una nueva tasa de cambio. Solo se permite una tasa por combinación de monedas por día.
```bash
curl -X POST http://localhost:3000/exchange-rates \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "fromCurrencyId": 1,
    "toCurrencyId": 2,
    "rate": 120.50,
    "date": "2026-01-09"
  }'
```

#### `PUT /exchange-rates/:id` → `hasPermission("exchange_rates.update")`
Actualiza una tasa de cambio existente.
```bash
curl -X PUT http://localhost:3000/exchange-rates/1 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "rate": 125.00
  }'
```

#### `DELETE /exchange-rates/:id` → `hasPermission("exchange_rates.delete")`
Elimina una tasa de cambio.
```bash
curl -X DELETE http://localhost:3000/exchange-rates/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Categories (Categorías)
- Router: [src/modules/categories/categories.routes.ts](src/modules/categories/categories.routes.ts)
- Controller: [src/modules/categories/categories.controller.ts](src/modules/categories/categories.controller.ts)
- Service: [src/modules/categories/categories.service.ts](src/modules/categories/categories.service.ts)
- Schemas: [src/modules/categories/categories.schemas.ts](src/modules/categories/categories.schemas.ts)

#### `GET /categories` → `hasPermission("categories.read")`
Lista todas las categorías activas.
```bash
curl -X GET http://localhost:3000/categories \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /categories/:id` → `hasPermission("categories.read")`
Obtiene una categoría por ID.
```bash
curl -X GET http://localhost:3000/categories/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /categories` → `hasPermission("categories.create")`
Crea una nueva categoría.
```bash
curl -X POST http://localhost:3000/categories \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Electrónica",
    "description": "Productos electrónicos y tecnológicos"
  }'
```

#### `PUT /categories/:id` → `hasPermission("categories.update")`
Actualiza una categoría existente.
```bash
curl -X PUT http://localhost:3000/categories/1 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Dispositivos electrónicos y accesorios"
  }'
```

#### `PUT /categories/:id/disable` → `hasPermission("categories.delete")`
Deshabilita una categoría (soft delete).
```bash
curl -X PUT http://localhost:3000/categories/1/disable \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `PUT /categories/:id/enable` → `hasPermission("categories.update")`
Habilita una categoría previamente deshabilitada.
```bash
curl -X PUT http://localhost:3000/categories/1/enable \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Products (Productos)
- Router: [src/modules/products/products.routes.ts](src/modules/products/products.routes.ts)
- Controller: [src/modules/products/products.controller.ts](src/modules/products/products.controller.ts)
- Service: [src/modules/products/products.service.ts](src/modules/products/products.service.ts)
- Schemas: [src/modules/products/products.schemas.ts](src/modules/products/products.schemas.ts)

#### `GET /products` → `hasPermission("products.read")`
Lista todos los productos activos.
```bash
curl -X GET http://localhost:3000/products \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /products/:id` → `hasPermission("products.read")`
Obtiene un producto por ID.
```bash
curl -X GET http://localhost:3000/products/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /products/category/:categoryId` → `hasPermission("products.read")`
Lista todos los productos de una categoría específica.
```bash
curl -X GET http://localhost:3000/products/category/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /products` → `hasPermission("products.create")`
Crea un nuevo producto.
```bash
curl -X POST http://localhost:3000/products \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop HP Pavilion",
    "code": "LAP-HP-001",
    "description": "Laptop 15.6 pulgadas, 8GB RAM, 256GB SSD",
    "costPrice": 450.00,
    "salePrice": 650.00,
    "currencyId": 1,
    "unitId": 1,
    "categoryId": 1
  }'
```

#### `PUT /products/:id` → `hasPermission("products.update")`
Actualiza un producto existente.
```bash
curl -X PUT http://localhost:3000/products/1 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "salePrice": 699.00
  }'
```

#### `PUT /products/:id/disable` → `hasPermission("products.delete")`
Deshabilita un producto (soft delete).
```bash
curl -X PUT http://localhost:3000/products/1/disable \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `PUT /products/:id/enable` → `hasPermission("products.update")`
Habilita un producto previamente deshabilitado.
```bash
curl -X PUT http://localhost:3000/products/1/enable \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Payment Types (Tipos de Pago)
- Router: [src/modules/payment_types/payment_types.routes.ts](src/modules/payment_types/payment_types.routes.ts)
- Controller: [src/modules/payment_types/payment_types.controller.ts](src/modules/payment_types/payment_types.controller.ts)
- Service: [src/modules/payment_types/payment_types.service.ts](src/modules/payment_types/payment_types.service.ts)
- Schemas: [src/modules/payment_types/payment_types.schemas.ts](src/modules/payment_types/payment_types.schemas.ts)

#### `GET /payment-types` → `hasPermission("payment_types.read")`
Lista todos los tipos de pago activos.
```bash
curl -X GET http://localhost:3000/payment-types \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `GET /payment-types/:id` → `hasPermission("payment_types.read")`
Obtiene un tipo de pago por ID.
```bash
curl -X GET http://localhost:3000/payment-types/1 \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `POST /payment-types` → `hasPermission("payment_types.create")`
Crea un nuevo tipo de pago.
```bash
curl -X POST http://localhost:3000/payment-types \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Efectivo",
    "description": "Pago en efectivo"
  }'
```

#### `PUT /payment-types/:id` → `hasPermission("payment_types.update")`
Actualiza un tipo de pago existente.
```bash
curl -X PUT http://localhost:3000/payment-types/1 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Pago en efectivo (billetes y monedas)"
  }'
```

#### `PUT /payment-types/:id/disable` → `hasPermission("payment_types.delete")`
Deshabilita un tipo de pago (soft delete).
```bash
curl -X PUT http://localhost:3000/payment-types/1/disable \
  -H "Authorization: Bearer eyJhbGc..."
```

#### `PUT /payment-types/:id/enable` → `hasPermission("payment_types.update")`
Habilita un tipo de pago previamente deshabilitado.
```bash
curl -X PUT http://localhost:3000/payment-types/1/enable \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Lógica de negocio (resumen)
- Autenticación:
  - Registro: eliminado. Los usuarios deben ser creados por un admin vía `POST /users`.
  - Login: valida credenciales, verifica que el usuario esté habilitado (`enabled = true`), actualiza `lastLogin`, emite tokens, responde con roles y permisos agrupados por rol.
  - Refresh: revoca el refresh token anterior y guarda el nuevo (rotación).
- Usuarios:
  - Campos obligatorios: email, password, nombre
  - Campos opcionales: apellido, telefono
  - No se eliminan físicamente: usar disable/enable para control de acceso
  - Usuario deshabilitado no puede hacer login
- Autorización:
  - Por roles (`isRole`) y por permisos (`hasPermission`).
  - `auth.middleware` construye `res.locals.user` con roles (por nombre) y permisos (lista plana) en base a pivotes.
- Modelo de permisos (completo - 38 permisos):
  - **Users**: `users.read`, `users.create`, `users.update`, `users.delete`, `users.roles.associate`, `users.warehouses.associate`
  - **Warehouses**: `warehouses.read`, `warehouses.create`, `warehouses.update`, `warehouses.delete`
  - **Roles**: `roles.read`, `roles.create`, `roles.update`, `roles.delete`
  - **Units**: `units.read`, `units.create`, `units.update`, `units.delete`
  - **Currencies**: `currencies.read`, `currencies.create`, `currencies.update`, `currencies.delete`
  - **Exchange Rates**: `exchange_rates.read`, `exchange_rates.create`, `exchange_rates.update`, `exchange_rates.delete`
  - **Categories**: `categories.read`, `categories.create`, `categories.update`, `categories.delete`
  - **Products**: `products.read`, `products.create`, `products.update`, `products.delete`
  - **Payment Types**: `payment_types.read`, `payment_types.create`, `payment_types.update`, `payment_types.delete`
  - Seed asigna todos al rol `admin`.
- Relaciones:
  - Usuarios ↔ Roles: muchos a muchos vía `user_roles`.
  - Usuarios ↔ Warehouses: muchos a muchos vía `user_warehouses`.
  - Roles ↔ Permisos: muchos a muchos vía `role_permissions`.
- Integridad referencial:
  - FKs con `CASCADE` en pivotes; `UNIQUE` en claves naturales (`email`, `name`).

---

## Notas de mantenimiento
- Al agregar nuevos endpoints:
  - Definir permisos asociados en `permissions` y seed si son fijos.
  - Actualizar guards en routers con `hasPermission`/`isRole`.
- Al cambiar el modelo:
  - Ajustar migración y verificar seeds idempotentes (`INSERT IGNORE`).
- Respuestas de Auth:
  - Mantener el formato acordado con roles y permisos por rol en `login`.
- Schemas Zod:
  - Todos los schemas deben usar formato `{ body: {...}, query: {...}, params: {...} }`.

---

## Scripts y uso rápido
- Desarrollo:
  ```bash
  npm run dev
  ```
- Migración manual:
  ```bash
  ts-node src/db/migrate.ts
  ```
- Build producción:
  ```bash
  npm run build
  npm start
  ```

---


