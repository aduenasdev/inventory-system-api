# Inventory System API — Contexto Completo

> [⬅️ Volver a README.md](README.md) para ver instalación y arquitectura general

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
│  │     └─ user_warehouses.ts
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
│     └─ warehouses/
│        ├─ warehouses.routes.ts
│        ├─ warehouses.controller.ts
│        ├─ warehouses.service.ts
│        └─ warehouses.schemas.ts
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
  - [src/db/schema/users.ts](src/db/schema/users.ts): `id`, `email`, `password`, `createdAt`, `lastLogin`.
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
Inicia sesión y actualiza `lastLogin`.
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
  "user": { "id": 1, "email": "admin@example.com" },
  "roles": [
    {
      "name": "admin",
      "permissions": ["users.read", "users.create", "users.update", "users.delete", "warehouses.read", "warehouses.create", "warehouses.update", "warehouses.delete", "roles.read", "roles.create", "roles.update", "roles.delete", "users.roles.associate", "users.warehouses.associate"]
    }
  ],
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."
}
```

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

---

### Users
- Router: [src/modules/users/users.routes.ts](src/modules/users/users.routes.ts)
- Controller: [src/modules/users/users.controller.ts](src/modules/users/users.controller.ts)
- Service: [src/modules/users/users.service.ts](src/modules/users/users.service.ts)
- Schemas: [src/modules/users/users.schemas.ts](src/modules/users/users.schemas.ts)

#### `POST /users` → `hasPermission("users.create")`
Crea un usuario con roles y warehouses opcionales.
```bash
curl -X POST http://localhost:3000/users \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "roleIds": [2],
    "warehouseIds": [1, 2]
  }'
```
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
Actualiza un usuario.
```bash
curl -X PUT http://localhost:3000/users/2 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com",
    "password": "newpassword123"
  }'
```

#### `DELETE /users/:userId` → `hasPermission("users.delete")`
Elimina un usuario (cascade elimina relaciones).
```bash
curl -X DELETE http://localhost:3000/users/2 \
  -H "Authorization: Bearer eyJhbGc..."
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

## Lógica de negocio (resumen)
- Autenticación:
  - Registro: eliminado. Los usuarios deben ser creados por un admin vía `POST /users`.
  - Login: valida credenciales, actualiza `lastLogin`, emite tokens, responde con roles y permisos agrupados por rol.
  - Refresh: revoca el refresh token anterior y guarda el nuevo (rotación).
- Autorización:
  - Por roles (`isRole`) y por permisos (`hasPermission`).
  - `auth.middleware` construye `res.locals.user` con roles (por nombre) y permisos (lista plana) en base a pivotes.
- Modelo de permisos (completo):
  - **Users**: `users.read`, `users.create`, `users.update`, `users.delete`, `users.roles.associate`, `users.warehouses.associate`
  - **Warehouses**: `warehouses.read`, `warehouses.create`, `warehouses.update`, `warehouses.delete`
  - **Roles**: `roles.read`, `roles.create`, `roles.update`, `roles.delete`
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


