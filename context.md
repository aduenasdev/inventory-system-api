# Inventory System API — Contexto Completo

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
│  │     └─ refresh_tokens.ts
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
│     └─ permissions/
│        ├─ permissions.routes.ts
│        ├─ permissions.controller.ts
│        └─ permissions.service.ts
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
  - Crea tablas: `users`, `roles`, `permissions`, pivotes `role_permissions`, `user_roles`, y `refresh_tokens`.
  - Constraints: `UNIQUE` en `users.email`, `roles.name`, `permissions.name`; FKs con `CASCADE`.
  - Seeds:
    - Roles fijos: `admin`, `user` (si no existen).
    - Usuario admin (email/password definidos en seed, password hasheado) y lo asigna al rol `admin`.
    - Permisos estandarizados: `users.read`, `users.create`, `users.update`, `users.delete`, `warehouses.create`.
    - Asigna todos los permisos anteriores al rol `admin`.
- Esquemas (Drizzle):
  - [src/db/schema/users.ts](src/db/schema/users.ts): `id`, `email`, `password`, `createdAt`.
  - [src/db/schema/roles.ts](src/db/schema/roles.ts): `id`, `name` (único), `description`.
  - [src/db/schema/permissions.ts](src/db/schema/permissions.ts): `id`, `name` (único), `description`, `group_name`.
  - [src/db/schema/role_permissions.ts](src/db/schema/role_permissions.ts): pivote (roleId, permissionId) con PK compuesta.
  - [src/db/schema/user_roles.ts](src/db/schema/user_roles.ts): pivote (userId, roleId) con PK compuesta.
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
  - `POST /auth/register` (público): valida con `registerUserSchema`.
  - `POST /auth/login` (público): valida con `loginUserSchema`.
  - `POST /auth/refresh` (público): rota refresh token.
  - `GET /auth/me` (privado): requiere `authMiddleware`.
- Controller: [src/modules/auth/auth.controller.ts](src/modules/auth/auth.controller.ts)
  - Orquesta llamadas al servicio y devuelve respuestas HTTP.
- Service: [src/modules/auth/auth.service.ts](src/modules/auth/auth.service.ts)
  - `registerUser`: crea usuario (hash), asigna rol por defecto `user` vía `user_roles`, emite tokens, y retorna:
    ```json
    {
      "user": { "id": number, "email": string },
      "roles": [ { "name": string, "permissions": string[] } ],
      "accessToken": string,
      "refreshToken": string
    }
    ```
  - `loginUser`: valida credenciales, rota tokens, y retorna misma estructura (roles con sus permisos por rol).
  - `refreshTokenService`: verifica/rota refresh token, revoca el anterior y almacena el nuevo.
- Schemas: [src/modules/auth/auth.schemas.ts](src/modules/auth/auth.schemas.ts)
  - `registerUserSchema`, `loginUserSchema` (zod).

### Users
- Router: [src/modules/users/users.routes.ts](src/modules/users/users.routes.ts)
  - CRUD protegido por permisos:
    - `POST /users` → `hasPermission("users.create")`
    - `GET /users` → `hasPermission("users.read")`
    - `GET /users/:userId` → `hasPermission("users.read")`
    - `PUT /users/:userId` → `hasPermission("users.update")`
    - `DELETE /users/:userId` → `hasPermission("users.delete")`
  - Asignación de roles (admin-only, se mantiene):
    - `POST /users/:userId/roles` → `isRole("admin")`
    - `DELETE /users/:userId/roles/:roleId` → `isRole("admin")`
- Controller: [src/modules/users/users.controller.ts](src/modules/users/users.controller.ts)
  - Implementa handlers HTTP para CRUD y gestión de roles.
- Service: [src/modules/users/users.service.ts](src/modules/users/users.service.ts)
  - `createUser`: hash de password, inserta usuario.
  - `getAllUsers`, `getUserById`.
  - `updateUser`: re-hash si cambia password.
  - `deleteUser`.
  - `assignRoleToUser`, `removeRoleFromUser`: gestionan pivote `user_roles`.
- Schemas: [src/modules/users/users.schemas.ts](src/modules/users/users.schemas.ts)
  - `createUserSchema`, `updateUserSchema`, `assignRoleToUserSchema`.

### Roles
- Router: [src/modules/roles/roles.routes.ts](src/modules/roles/roles.routes.ts)
  - `GET /roles` (privado)
  - `GET /roles/:roleId` (privado)
  - `POST /roles` (admin-only): `isRole("admin")`
  - `PUT /roles/:roleId` (admin-only): `isRole("admin")`
  - `DELETE /roles/:roleId` (admin-only): `isRole("admin")` y solo si el rol NO está asignado a ningún usuario.
  - `GET /roles/:roleId/permissions` (privado)
  - `POST /roles/:roleId/permissions` (admin-only): `isRole("admin")`
- Controller: [src/modules/roles/roles.controller.ts](src/modules/roles/roles.controller.ts)
  - Handlers para CRUD de roles y sus permisos.
- Service: [src/modules/roles/roles.service.ts](src/modules/roles/roles.service.ts)
  - `createRole`, `getAllRoles`, `getRoleById`, `updateRole`.
  - `deleteRole`: valida que no haya registros en `user_roles`.
  - `addPermissionToRole`, `getPermissionsForRole` (usa `role_permissions`).
- Schemas: [src/modules/roles/roles.schemas.ts](src/modules/roles/roles.schemas.ts)
  - `createRoleSchema`, `updateRoleSchema`, `addPermissionToRoleSchema`.

### Permissions
- Router: [src/modules/permissions/permissions.routes.ts](src/modules/permissions/permissions.routes.ts)
  - `GET /permissions` (privado): requiere autenticación, sin permiso específico.
- Controller/Service:
  - [src/modules/permissions/permissions.controller.ts](src/modules/permissions/permissions.controller.ts)
  - [src/modules/permissions/permissions.service.ts](src/modules/permissions/permissions.service.ts)
  - Listan todos los permisos de la tabla `permissions`.

---

## Lógica de negocio (resumen)
- Autenticación:
  - Registro: crea usuario, asigna rol por defecto `user` en `user_roles`, emite tokens.
  - Login: valida credenciales, emite tokens, responde con los roles del usuario y los permisos agrupados por rol (no se devuelve lista plana en respuesta, sólo en `res.locals.user`).
  - Refresh: revoca el refresh token anterior y guarda el nuevo (rotación).
- Autorización:
  - Por roles (`isRole`) y por permisos (`hasPermission`).
  - `auth.middleware` construye `res.locals.user` con roles (por nombre) y permisos (lista plana) en base a pivotes.
- Modelo de permisos (estandarizado):
  - `users.read`, `users.create`, `users.update`, `users.delete`, `warehouses.create`.
  - Seed asigna todos al rol `admin`.
- Usuarios con múltiples roles:
  - Soportado por `user_roles`.
- Integridad referencial:
  - FKs con `CASCADE`; `UNIQUE` en claves naturales (`email`, `name`).

---

## Notas de mantenimiento
- Al agregar nuevos endpoints:
  - Definir permisos asociados en `permissions` y seed si son fijos.
  - Actualizar guards en routers con `hasPermission`/`isRole`.
- Al cambiar el modelo:
  - Ajustar migración y verificar seeds idempotentes (`INSERT IGNORE`).
- Respuestas de Auth:
  - Mantener el formato acordado con roles y permisos por rol en `register` y `login`.

---

## Scripts y uso rápido
- Desarrollo:
  ```bash
  npm run dev
  ```
- Migraciones/seeds (si aplica): ejecutar el script de migración.

Si necesitas que añada ejemplos de respuestas de cada endpoint o curl para pruebas rápidas, lo preparo y lo integro aquí.
