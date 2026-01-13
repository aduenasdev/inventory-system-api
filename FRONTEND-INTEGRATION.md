# Guía de Integración Frontend - Inventory System API

## � Navegación de Documentación

- 📖 **[README.md](README.md)** - Visión general, instalación y arquitectura
- 🔧 **[context.md](context.md)** - Documentación técnica completa con ejemplos CURL
- 🎨 **[FRONTEND-INTEGRATION.md](FRONTEND-INTEGRATION.md)** - Guía de integración con frontend (estás aquí)
- 📊 **[REPORTES.md](REPORTES.md)** - Documentación de reportes y analytics

---

## �🔐 Sistema de Autenticación

### Flujo de Tokens
- **Access Token**: Válido por 15 minutos, se envía en header `Authorization: Bearer <token>`
- **Refresh Token**: Válido por 7 días, se usa para renovar el access token
- **Almacenamiento**: Access token en memoria/state, refresh token en localStorage o httpOnly cookie

### Manejo de Tokens en el Frontend
```javascript
// Configuración base de axios/fetch
const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para agregar token en cada request
api.interceptors.request.use((config) => {
  const token = getAccessToken(); // desde state/context
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar token expirado
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expirado, intentar refresh
      const newToken = await refreshAccessToken();
      if (newToken) {
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return api.request(error.config);
      } else {
        // Refresh falló, redirigir a login
        redirectToLogin();
      }
    }
    return Promise.reject(error);
  }
);
```

---

## 📋 ENDPOINTS POR MÓDULO

---

## 🔑 1. AUTH MODULE

### 1.1 POST /auth/login
**Descripción**: Autenticar usuario y obtener tokens

**Request Body**:
```json
{
  "email": "admin@example.com",
  "password": "Admin123"
}
```

**Validaciones**:
- Email válido
- Contraseña: mínimo 6 caracteres, 1 mayúscula, 1 minúscula, 1 número

**Response Success (200)**:
```json
{
  "message": "Login exitoso",
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "telefono": "809-555-0100"
  },
  "roles": ["admin", "manager"],
  "permissions": [
    "categories.create",
    "categories.read",
    "categories.update",
    "categories.delete",
    "users.create",
    "users.read",
    "warehouses.read",
    "..."
  ]
}
```

**Lógica Frontend**:
1. Validar formulario de login con Zod/Yup
2. Enviar POST a `/auth/login`
3. Guardar `accessToken` en state global (Context/Redux/Zustand)
4. Guardar `refreshToken` en localStorage
5. Guardar `user` en state global
6. Redirigir a dashboard

**Manejo de Errores**:
- 400: Credenciales inválidas → Mostrar error en formulario
- 400: Usuario deshabilitado → "Usuario deshabilitado. Contacte al administrador"
- 401: Usuario no encontrado → "Email o contraseña incorrectos"
- 500: Error servidor → Mostrar mensaje genérico

---

### 1.2 POST /auth/refresh
**Descripción**: Renovar access token usando refresh token

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response Success (200)**:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Lógica Frontend**:
1. Se ejecuta automáticamente cuando API responde 401
2. Obtener refresh token de localStorage
3. Enviar POST a `/auth/refresh`
4. Actualizar `accessToken` en state
5. Actualizar `refreshToken` en localStorage (rotación)
6. Reintentar request original

**Manejo de Errores**:
- 401: Refresh token inválido → Cerrar sesión y redirigir a login
- 404: Token no encontrado → Cerrar sesión

---

### 1.3 POST /auth/logout
**Descripción**: Cerrar sesión y revocar refresh token

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response Success (200)**:
```json
{
  "message": "Sesión cerrada"
}
```

**Lógica Frontend**:
1. Obtener refresh token de localStorage
2. Enviar POST a `/auth/logout`
3. Limpiar state global (user, accessToken)
4. Limpiar localStorage (refreshToken)
5. Redirigir a página de login

---

### 1.4 GET /auth/me
**Descripción**: Obtener información del usuario autenticado

**Headers**: `Authorization: Bearer <accessToken>`

**Response Success (200)**:
```json
{
  "id": 1,
  "email": "admin@example.com",
  "nombre": "Juan",
  "apellido": "Pérez",
  "telefono": "809-555-0100",
  "roles": ["Admin", "Manager"],
  "permissions": [
    "users.read",
    "users.create",
    "warehouses.read",
    "roles.read"
  ]
}
```

**Lógica Frontend**:
1. Ejecutar al cargar la aplicación (si hay token)
2. Usar para verificar sesión activa
3. Guardar roles y permisos en state
4. Usar permisos para mostrar/ocultar elementos UI
5. Usar roles para control de rutas

**Ejemplo de uso**:
```javascript
// Verificar si usuario tiene permiso
const canCreateUsers = user.permissions.includes('users.create');

// Mostrar botón condicionalmente
{canCreateUsers && <Button>Crear Usuario</Button>}

// Proteger ruta
<ProtectedRoute permission="users.read">
  <UsersPage />
</ProtectedRoute>
```

---

### 1.5 PUT /auth/change-password
**Descripción**: Cambiar contraseña del usuario autenticado (sin permisos especiales)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: Solo autenticación (cualquier usuario)

**Request Body**:
```json
{
  "currentPassword": "OldPass123",
  "newPassword": "NewSecure456"
}
```

**Validaciones**:
- currentPassword: requerida
- newPassword: min 6 caracteres, 1 mayúscula, 1 minúscula, 1 número

**Response Success (200)**:
```json
{
  "message": "Contraseña actualizada exitosamente"
}
```

**Lógica Frontend**:
1. Formulario con campos: Contraseña actual, Nueva contraseña, Confirmar nueva
2. Validar que nueva contraseña cumple requisitos
3. Validar que nueva contraseña coincida con confirmación
4. Enviar PUT a `/auth/change-password`
5. Mostrar mensaje de éxito
6. Opcional: Cerrar sesión y pedir login con nueva contraseña

**Manejo de Errores**:
- 400: Contraseña actual incorrecta → "La contraseña actual no coincide"
- 400: Nueva contraseña no cumple requisitos → Mostrar requisitos específicos

**Ventajas**:
- ✅ Cualquier usuario puede cambiar su propia contraseña
- ✅ No requiere permisos de administrador
- ✅ Valida contraseña actual por seguridad
- ✅ Mismo nivel de validación que creación de usuarios

---

## 👥 2. USERS MODULE

**Nota importante**: Para que un usuario cambie SU PROPIA contraseña, usar `PUT /auth/change-password`. El endpoint `PUT /users/:id` es solo para administradores con el permiso `users.update`.

### 2.1 GET /users
**Descripción**: Listar todos los usuarios

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "email": "admin@example.com",
    "createdAt": "2025-01-09T10:00:00.000Z",
    "lastLogin": "2025-01-09T15:30:00.000Z",
    "roles": [
      {
        "id": 1,
        "name": "Admin",
        "description": "Administrador del sistema"
      }
    ],
    "warehouses": [
      {
        "id": 1,
        "name": "Almacén Central",
        "provincia": "Santo Domingo",
        "municipio": "DN"
      }
    ]
  }
]
```

**Lógica Frontend**:
1. Verificar permiso `users.read` antes de cargar página
2. Hacer GET a `/users` con token
3. Mostrar tabla/lista de usuarios con:
   - Nombre, apellido, email, teléfono, estado (habilitado/deshabilitado), última sesión
4. Agregar filtros por nombre, email, estado
5. Agregar paginación si hay muchos usuarios
6. Botones de acción: Editar, Deshabilitar/Habilitar (según permisos)
7. Indicador visual de estado: badge verde (habilitado) o rojo (deshabilitado)

---

### 2.2 GET /users/:id
**Descripción**: Obtener información detallada de un usuario

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.read`

**Response Success (200)**:
```json
{
  "id": 1,
  "email": "admin@example.com",
  "createdAt": "2025-01-09T10:00:00.000Z",
  "lastLogin": "2025-01-09T15:30:00.000Z",
  "roles": [...],
  "warehouses": [...]
}
```

**Lógica Frontend**:
1. Usar para modal de "Ver detalles"
2. Usar para página de edición (cargar datos)
3. Mostrar información completa del usuario

---

### 2.3 POST /users
**Descripción**: Crear nuevo usuario con roles y almacenes

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.create`

**Request Body**:
```json
{
  "email": "nuevo@example.com",
  "password": "Secure123",
  "roleIds": [2, 3],
  "warehouseIds": [1, 2]
}
```

**Validaciones**:
- Email: válido y único
- Password: min 6 caracteres, 1 mayúscula, 1 minúscula, 1 número
- nombre: requerido, no vacío
- apellido: opcional
- telefono: opcional
- roleIds: array con al menos 1 rol (requerido)
- warehouseIds: array opcional
- enabled: se crea habilitado por defecto (true)

**Response Success (201)**:
```json
{
  "message": "Usuario creado exitosamente",
  "user": {
    "id": 5,
    "email": "nuevo@example.com",
    "createdAt": "2025-01-09T16:00:00.000Z"
  }
}
```

**Lógica Frontend**:
1. Formulario con campos: nombre (requerido), apellido, teléfono, email, password, confirm password
2. Multi-select para roles (cargar de GET /roles)
3. Multi-select para almacenes (cargar de GET /warehouses)
4. Validar formulario localmente antes de enviar
5. Enviar POST a `/users` (el usuario se crea habilitado por defecto)
6. Mostrar mensaje de éxito
7. Redirigir a lista de usuarios o limpiar formulario

**Manejo de Errores**:
- 400: Email ya existe → "El email ya está registrado"
- 400: Password débil → Mostrar requisitos
- 403: Sin permisos → No mostrar botón de crear

---

### 2.4 PUT /users/:id
**Descripción**: Actualizar email o contraseña de usuario

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.update`

**Request Body** (todos los campos opcionales):
```json
{
  "email": "actualizado@example.com",
  "password": "NewPass123",
  "nombre": "Juan Carlos",
  "apellido": "Rodríguez",
  "telefono": "809-555-0300"
}
```

**Response Success (200)**:
```json
{
  "message": "Usuario actualizado exitosamente"
}
```

**Lógica Frontend**:
1. Cargar datos actuales con GET /users/:id
2. Formulario pre-llenado con nombre, apellido, teléfono, email
3. Campo password opcional (vacío = no cambiar)
4. Validar cambios antes de enviar
5. Enviar PUT con solo los campos modificados

**Nota**: Para cambiar roles/almacenes usar los endpoints específicos. Para habilitar/deshabilitar usar PUT /users/:id/enable o /users/:id/disable

---

### 2.5 PUT /users/:id/disable
**Descripción**: Deshabilitar usuario (soft delete, no se elimina de BD)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.delete`

**Response Success (200)**:
```json
{
  "message": "Usuario deshabilitado"
}
```

**Lógica Frontend**:
1. Botón "Deshabilitar" solo visible con permiso `users.delete` y si usuario está habilitado
2. Mostrar confirmación: "¿Deshabilitar usuario [nombre]? No podrá iniciar sesión."
3. Enviar PUT a `/users/:id/disable`
4. Actualizar estado del usuario en la lista (cambiar badge a rojo)
5. Mostrar notificación de éxito

**Importante**: El usuario no se elimina de la base de datos, solo se marca como `enabled = false` y no podrá hacer login.

---

### 2.6 PUT /users/:id/enable
**Descripción**: Habilitar usuario previamente deshabilitado

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.update`

**Response Success (200)**:
```json
{
  "message": "Usuario habilitado"
}
```

**Lógica Frontend**:
1. Botón "Habilitar" solo visible con permiso `users.update` y si usuario está deshabilitado
2. Enviar PUT a `/users/:id/enable`
3. Actualizar estado del usuario en la lista (cambiar badge a verde)
4. Mostrar notificación de éxito

---

### 2.7 POST /users/:userId/roles
**Descripción**: Asignar rol a usuario existente

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.assign_roles`

**Request Body**:
```json
{
  "roleId": 3
}
```

**Response Success (201)**:
```json
{
  "message": "Rol asignado al usuario exitosamente"
}
```

**Lógica Frontend**:
1. En página de edición de usuario
2. Mostrar roles actuales del usuario
3. Dropdown con roles disponibles (GET /roles)
4. Botón "Agregar rol"
5. Enviar POST con roleId seleccionado
6. Actualizar lista de roles del usuario

---

### 2.8 POST /users/:userId/warehouses
**Descripción**: Asignar almacenes a usuario

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.assign_warehouses`

**Request Body**:
```json
{
  "warehouseIds": [1, 3, 5]
}
```

**Response Success (201)**:
```json
{
  "message": "Almacenes asignados al usuario exitosamente"
}
```

**Lógica Frontend**:
1. En página de edición de usuario
2. Multi-select con almacenes disponibles (GET /warehouses)
3. Mostrar almacenes ya asignados
4. Enviar POST con array de IDs
5. Actualizar vista de almacenes del usuario

---

## 🏷️ 3. ROLES MODULE

### 3.1 GET /roles
**Descripción**: Listar todos los roles del sistema

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `roles.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "name": "Admin",
    "description": "Administrador del sistema",
    "createdAt": "2025-01-09T10:00:00.000Z"
  },
  {
    "id": 2,
    "name": "Manager",
    "description": "Gerente de almacén",
    "createdAt": "2025-01-09T10:00:00.000Z"
  }
]
```

**Lógica Frontend**:
1. Página de gestión de roles
2. Tabla con columnas: Nombre, Descripción, Acciones
3. Botón "Crear Rol" (si tiene `roles.create`)
4. Botones editar/eliminar por fila

---

### 3.2 GET /roles/:roleId
**Descripción**: Obtener información de un rol específico

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `roles.read`

**Response Success (200)**:
```json
{
  "id": 1,
  "name": "Admin",
  "description": "Administrador del sistema",
  "createdAt": "2025-01-09T10:00:00.000Z"
}
```

**Lógica Frontend**:
1. Usar para cargar datos en formulario de edición
2. Usar para modal de detalles

---

### 3.3 POST /roles
**Descripción**: Crear nuevo rol

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `roles.create`

**Request Body**:
```json
{
  "name": "Vendedor",
  "description": "Personal de ventas"
}
```

**Response Success (201)**:
```json
{
  "message": "Rol creado exitosamente",
  "role": {
    "id": 4,
    "name": "Vendedor",
    "description": "Personal de ventas"
  }
}
```

**Lógica Frontend**:
1. Modal o página de creación
2. Campos: Nombre (requerido), Descripción (opcional)
3. Validar nombre no vacío
4. Enviar POST
5. Actualizar lista de roles

---

### 3.4 PUT /roles/:roleId
**Descripción**: Actualizar nombre o descripción de rol

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `roles.update`

**Request Body**:
```json
{
  "name": "Vendedor Senior",
  "description": "Personal de ventas con experiencia"
}
```

**Response Success (200)**:
```json
{
  "message": "Rol actualizado exitosamente"
}
```

**Lógica Frontend**:
1. Cargar datos actuales con GET /roles/:roleId
2. Pre-llenar formulario
3. Permitir edición de nombre y descripción
4. Enviar PUT con cambios

---

### 3.5 DELETE /roles/:roleId
**Descripción**: Eliminar rol del sistema

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `roles.delete`

**Response Success (200)**:
```json
{
  "message": "Rol eliminado exitosamente"
}
```

**Lógica Frontend**:
1. Confirmación antes de eliminar
2. Advertir que eliminará las asignaciones a usuarios
3. Enviar DELETE
4. Actualizar lista

---

### 3.6 GET /roles/:roleId/permissions
**Descripción**: Obtener todos los permisos asignados a un rol

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `roles.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "name": "users.read",
    "description": "Ver usuarios",
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

**Lógica Frontend**:
1. Mostrar en página de detalles de rol
2. Listar permisos agrupados por `group`
3. Sección "Usuarios", "Almacenes", "Roles"
4. Checkbox o switch para cada permiso

---

### 3.7 POST /roles/:roleId/permissions
**Descripción**: Asignar un permiso a un rol

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `roles.update`

**Request Body**:
```json
{
  "permissionId": 5
}
```

**Response Success (201)**:
```json
{
  "message": "Permiso asignado al rol exitosamente"
}
```

**Lógica Frontend**:
1. En página de edición de rol
2. Cargar permisos del rol (GET /roles/:roleId/permissions)
3. Cargar todos los permisos disponibles (GET /permissions)
4. Mostrar checkbox por cada permiso
5. Al marcar checkbox: POST permiso
6. Al desmarcar: DELETE (si implementado, o ignorar si no existe endpoint)

---

## 🔑 4. PERMISSIONS MODULE

### 4.1 GET /permissions
**Descripción**: Listar todos los permisos del sistema

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: Solo autenticación (cualquier usuario logueado)

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "name": "users.read",
    "description": "Ver usuarios",
    "group": "users"
  },
  {
    "id": 2,
    "name": "users.create",
    "description": "Crear usuarios",
    "group": "users"
  },
  {
    "id": 3,
    "name": "warehouses.read",
    "description": "Ver almacenes",
    "group": "warehouses"
  }
]
```

**Lógica Frontend**:
1. Usar para poblar dropdown/checkbox de permisos
2. Agrupar por `group` para mejor UI
3. Mostrar en formulario de asignación a roles

**Permisos disponibles (49 total)**:
- **users**: read, create, update, delete, roles.associate, warehouses.associate
- **warehouses**: read, create, update, delete
- **roles**: read, create, update, delete
- **units**: read, create, update, delete
- **currencies**: read, create, update, delete
- **exchange_rates**: read, create, update, delete
- **categories**: read, create, update, delete
- **products**: read, create, update, delete
- **payment_types**: read, create, update, delete
- **inventory**: read, create, update, adjust
- **purchases**: read, create, update, delete
- **sales**: read, create, update, delete
- **transfers**: read, create, update
- **categories**: read, create, update, delete
- **products**: read, create, update, delete
- **payment_types**: read, create, update, delete

---

### 4.2 POST /permissions
**Descripción**: Crear nuevo permiso (solo para admins)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: Usuario debe ser Admin (isRole)

**Request Body**:
```json
{
  "name": "inventory.read",
  "description": "Ver inventario",
  "group": "inventory"
}
```

**Response Success (201)**:
```json
{
  "message": "Permiso creado exitosamente",
  "permission": {
    "id": 15,
    "name": "inventory.read",
    "description": "Ver inventario",
    "group": "inventory"
  }
}
```

**Lógica Frontend**:
1. Solo mostrar a usuarios Admin
2. Formulario con nombre, descripción, grupo
3. Validar formato de nombre (ej: group.action)
4. Usar para extender permisos del sistema

---

## 🏢 5. WAREHOUSES MODULE

### 5.1 GET /warehouses
**Descripción**: Listar todos los almacenes

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `warehouses.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "name": "Almacén Central",
    "provincia": "Santo Domingo",
    "municipio": "DN",
    "direccion": "Av. 27 de Febrero #123",
    "ubicacion": "18.4861,-69.9312",
    "createdAt": "2025-01-09T10:00:00.000Z"
  }
]
```

**Lógica Frontend**:
1. Tabla de almacenes con: Nombre, Provincia, Municipio, Dirección
2. Filtros por provincia/municipio
3. Botón "Crear Almacén" (si tiene `warehouses.create`)
4. Si tiene `ubicacion` (lat,lng), mostrar mapa

---

### 5.2 GET /warehouses/:id
**Descripción**: Obtener información de un almacén específico

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `warehouses.read`

**Response Success (200)**:
```json
{
  "id": 1,
  "name": "Almacén Central",
  "provincia": "Santo Domingo",
  "municipio": "DN",
  "direccion": "Av. 27 de Febrero #123",
  "ubicacion": "18.4861,-69.9312",
  "createdAt": "2025-01-09T10:00:00.000Z"
}
```

**Lógica Frontend**:
1. Usar para página de detalles
2. Mostrar información completa
3. Mostrar mapa si tiene ubicación

---

### 5.3 POST /warehouses
**Descripción**: Crear nuevo almacén

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `warehouses.create`

**Request Body**:
```json
{
  "name": "Almacén Norte",
  "provincia": "Santiago",
  "municipio": "Santiago",
  "direccion": "Calle Principal #456",
  "ubicacion": "19.4517,-70.6973"
}
```

**Validaciones**:
- name: requerido
- provincia: requerida
- municipio: requerido
- direccion: opcional
- ubicacion: opcional (formato: "lat,lng")

**Response Success (201)**:
```json
{
  "message": "Almacén creado exitosamente",
  "warehouse": {
    "id": 5,
    "name": "Almacén Norte",
    "provincia": "Santiago",
    "municipio": "Santiago"
  }
}
```

**Lógica Frontend**:
1. Formulario con campos: nombre, provincia, municipio, dirección
2. Dropdown de provincias dominicanas
3. Dropdown de municipios según provincia seleccionada
4. Campo opcional de dirección
5. Selector de mapa para ubicación (opcional)
6. Enviar POST

---

### 5.4 PUT /warehouses/:id
**Descripción**: Actualizar información de almacén

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `warehouses.update`

**Request Body** (todos opcionales):
```json
{
  "name": "Almacén Central Renovado",
  "provincia": "Santo Domingo",
  "municipio": "DN",
  "direccion": "Nueva dirección",
  "ubicacion": "18.4861,-69.9312"
}
```

**Response Success (200)**:
```json
{
  "message": "Almacén actualizado exitosamente"
}
```

**Lógica Frontend**:
1. Cargar datos actuales con GET /warehouses/:id
2. Pre-llenar formulario
3. Permitir editar cualquier campo
4. Enviar PUT con cambios

**Manejo de Errores**:
- 400: Nombre duplicado → "El nombre ya está en uso por otro almacén"

---

### 5.5 DELETE /warehouses/:id
**Descripción**: Eliminar almacén

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `warehouses.delete`

**Response Success (200)**:
```json
{
  "message": "Almacén eliminado exitosamente"
}
```

**Lógica Frontend**:
1. Confirmación antes de eliminar
2. Enviar DELETE
3. Si error 400: Mostrar "No se puede eliminar el almacén porque tiene usuarios asignados"
4. Si éxito: Actualizar lista

**Manejo de Errores**:
- 400: Almacén tiene usuarios asignados → "No se puede eliminar el almacén porque tiene usuarios asignados. Primero remueva los usuarios."

---

### 5.6 GET /warehouses/:id/users
**Descripción**: Listar usuarios asignados a un almacén

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `warehouses.read`

**Response Success (200)**:
```json
[
  {
    "id": 2,
    "email": "manager@example.com",
    "createdAt": "2025-01-09T10:00:00.000Z"
  },
  {
    "id": 3,
    "email": "vendedor@example.com",
    "createdAt": "2025-01-09T11:00:00.000Z"
  }
]
```

**Lógica Frontend**:
1. En página de detalles de almacén
2. Sección "Usuarios asignados"
3. Tabla con email de usuarios
4. Botón "Remover" por usuario (si tiene permiso)
5. Botón "Asignar usuarios" (si tiene permiso)

---

### 5.7 POST /warehouses/:id/users
**Descripción**: Asignar usuario a almacén

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.assign_warehouses`

**Request Body**:
```json
{
  "userId": 4
}
```

**Response Success (201)**:
```json
{
  "message": "Usuario asignado al almacén exitosamente"
}
```

**Lógica Frontend**:
1. En página de detalles de almacén
2. Dropdown con usuarios disponibles (GET /users)
3. Filtrar usuarios ya asignados
4. Botón "Asignar"
5. Enviar POST con userId
6. Actualizar lista de usuarios del almacén

---

### 5.8 DELETE /warehouses/:warehouseId/users/:userId
**Descripción**: Remover usuario de almacén

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.assign_warehouses`

**Response Success (200)**:
```json
{
  "message": "Usuario removido del almacén exitosamente"
}
```

**Lógica Frontend**:
1. Botón "Remover" en lista de usuarios del almacén
2. Confirmación: "¿Remover a [email] de [almacén]?"
3. Enviar DELETE
4. Actualizar lista de usuarios

---

## 🎯 BUENAS PRÁCTICAS DE IMPLEMENTACIÓN

### 1. Manejo de Estado Global
```javascript
// Usar Context API, Redux, Zustand, etc.
const AuthContext = {
  user: null,
  accessToken: null,
  refreshToken: null,
  permissions: [],
  roles: [],
  isAuthenticated: false,
  login: (credentials) => {},
  logout: () => {},
  hasPermission: (permission) => permissions.includes(permission),
  hasRole: (role) => roles.some(r => r.name === role)
};
```

### 2. Componentes Reutilizables
```javascript
// ProtectedRoute.jsx
const ProtectedRoute = ({ permission, children }) => {
  const { hasPermission } = useAuth();
  
  if (!hasPermission(permission)) {
    return <Navigate to="/unauthorized" />;
  }
  
  return children;
};

// ConditionalRender.jsx
const Can = ({ permission, children, fallback = null }) => {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? children : fallback;
};

// Uso
<Can permission="users.create">
  <Button onClick={handleCreate}>Crear Usuario</Button>
</Can>
```

### 3. Hooks Personalizados
```javascript
// useApi.js
const useApi = () => {
  const { accessToken, refreshToken, logout } = useAuth();
  
  const request = async (url, options = {}) => {
    try {
      const response = await fetch(`http://localhost:3000${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          ...options.headers
        }
      });
      
      if (response.status === 401) {
        // Intentar refresh
        const newToken = await refreshAccessToken(refreshToken);
        if (newToken) {
          // Reintentar con nuevo token
          return request(url, options);
        } else {
          logout();
          throw new Error('Sesión expirada');
        }
      }
      
      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  };
  
  return { request };
};

// useFetch.js
const useFetch = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { request } = useApi();
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await request(url, options);
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [url]);
  
  return { data, loading, error };
};
```

### 4. Manejo de Errores UI
```javascript
// ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorPage error={this.state.error} />;
    }
    return this.props.children;
  }
}

// Toast notifications para feedback
const showToast = (message, type = 'success') => {
  // Usar librería como react-toastify, sonner, etc.
  toast[type](message);
};
```

### 5. Validación de Formularios
```javascript
// Usar Zod en frontend también (consistencia con backend)
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email({ message: "Email inválido" }),
  password: z
    .string()
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres" })
    .regex(/[A-Z]/, { message: "Debe contener al menos una mayúscula" })
    .regex(/[a-z]/, { message: "Debe contener al menos una minúscula" })
    .regex(/[0-9]/, { message: "Debe contener al menos un número" })
});

// Uso con react-hook-form
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(loginSchema)
});
```

### 6. Estructura de Carpetas Frontend
```
src/
├── api/
│   ├── auth.js          # Funciones de API de auth
│   ├── users.js         # Funciones de API de users
│   ├── roles.js
│   ├── warehouses.js
│   └── client.js        # Configuración axios/fetch
├── components/
│   ├── auth/
│   │   ├── LoginForm.jsx
│   │   └── ProtectedRoute.jsx
│   ├── users/
│   │   ├── UserList.jsx
│   │   ├── UserForm.jsx
│   │   └── UserCard.jsx
│   ├── common/
│   │   ├── Button.jsx
│   │   ├── Modal.jsx
│   │   └── Table.jsx
│   └── layout/
│       ├── Navbar.jsx
│       └── Sidebar.jsx
├── pages/
│   ├── LoginPage.jsx
│   ├── UsersPage.jsx
│   ├── RolesPage.jsx
│   └── WarehousesPage.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useApi.js
│   └── useFetch.js
├── context/
│   └── AuthContext.jsx
├── utils/
│   ├── validators.js
│   └── formatters.js
└── App.jsx
```

---

## 🚨 CÓDIGOS DE ERROR COMUNES

### Códigos HTTP
- **200**: OK - Request exitoso
- **201**: Created - Recurso creado exitosamente
- **400**: Bad Request - Datos inválidos o faltantes
- **401**: Unauthorized - Token inválido o expirado
- **403**: Forbidden - Sin permisos para esta acción
- **404**: Not Found - Recurso no encontrado
- **500**: Internal Server Error - Error del servidor

### Manejo en Frontend
```javascript
const handleError = (error) => {
  const status = error.response?.status;
  
  switch(status) {
    case 400:
      showToast(error.response.data.message || 'Datos inválidos', 'error');
      break;
    case 401:
      // Manejar por interceptor (refresh o logout)
      break;
    case 403:
      showToast('No tienes permisos para esta acción', 'error');
      break;
    case 404:
      showToast('Recurso no encontrado', 'error');
      break;
    case 500:
      showToast('Error del servidor. Intenta más tarde', 'error');
      break;
    default:
      showToast('Ocurrió un error inesperado', 'error');
  }
};
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Módulo de Autenticación
- [ ] Página de login con validación
- [ ] Guardar tokens en state + localStorage
- [ ] Implementar refresh token automático
- [ ] Función de logout que limpia todo
- [ ] Verificar sesión al cargar app (GET /auth/me)
- [ ] Redirigir a login si no está autenticado

### Módulo de Usuarios
- [ ] Lista de usuarios con filtros
- [ ] Formulario de creación con multi-select de roles/almacenes
- [ ] Formulario de edición
- [ ] Modal de confirmación para eliminar
- [ ] Asignación de roles/almacenes
- [ ] Mostrar última sesión (lastLogin)

### Módulo de Roles
- [ ] Lista de roles con CRUD
- [ ] Asignación de permisos con checkboxes
- [ ] Vista de permisos por rol agrupados por categoría

### Módulo de Almacenes
- [ ] Lista de almacenes con filtros por provincia
- [ ] CRUD de almacenes
- [ ] Selector de provincia/municipio
- [ ] Integración de mapa (opcional)
- [ ] Gestión de usuarios por almacén

### Control de Permisos UI
- [ ] Mostrar/ocultar botones según permisos
- [ ] Proteger rutas con ProtectedRoute
- [ ] Deshabilitar formularios si no tiene permisos
- [ ] Mostrar mensaje de "Sin permisos" cuando aplique

### Experiencia de Usuario
- [ ] Loading states en todas las peticiones
- [ ] Toast notifications para feedback
- [ ] Manejo de errores con mensajes claros
- [ ] Validación de formularios antes de enviar
- [ ] Confirmación en acciones destructivas (delete)

---

## 📏 5. UNITS MODULE (Unidades de Medida)

### 5.1 GET /units
**Descripción**: Listar todas las unidades de medida activas

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `units.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "name": "Kilogramo",
    "shortName": "kg",
    "description": "Unidad de masa del SI",
    "type": "weight",
    "isActive": true,
    "createdAt": "2026-01-09T10:00:00.000Z",
    "updatedAt": "2026-01-09T10:00:00.000Z"
  }
]
```

**Lógica Frontend**:
1. Tabla: Nombre, Abreviatura, Tipo, Descripción, Estado, Acciones
2. Filtros por tipo (peso, volumen, longitud, cantidad)
3. Badge de estado (activo/inactivo)

---

### 5.2 POST /units
**Descripción**: Crear nueva unidad de medida

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `units.create`

**Request Body**:
```json
{
  "name": "Litro",
  "shortName": "L",
  "description": "Unidad de volumen",
  "type": "volume"
}
```

**Validaciones**:
- name: único, requerido
- shortName: único, requerido
- type: requerido (weight, volume, length, count)

**Lógica Frontend**:
1. Formulario: Nombre, Abreviatura, Tipo (dropdown), Descripción
2. Selector de tipo: Peso, Volumen, Longitud, Cantidad

**Manejo de Errores**:
- 400: "Ya existe una unidad con el nombre ..."
- 400: "Ya existe una unidad con la abreviatura ..."

---

## 💰 6. CURRENCIES MODULE (Monedas)

### 6.1 GET /currencies
**Descripción**: Listar todas las monedas activas. Seeds: USD y CUP

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `currencies.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "name": "Dólar Estadounidense",
    "code": "USD",
    "symbol": "$",
    "decimalPlaces": 2,
    "isActive": true
  }
]
```

**Lógica Frontend**:
1. Tabla: Nombre, Código, Símbolo, Decimales, Estado, Acciones
2. Usar en dropdowns de productos y tasas de cambio

---

### 6.2 POST /currencies
**Descripción**: Crear nueva moneda

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `currencies.create`

**Request Body**:
```json
{
  "name": "Euro",
  "code": "EUR",
  "symbol": "€",
  "decimalPlaces": 2
}
```

**Validaciones**:
- name: único, requerido
- code: único, requerido (3 caracteres ISO)

**Lógica Frontend**:
1. Formulario: Nombre, Código (3 letras), Símbolo, Decimales
2. Validar formato ISO para código

**Manejo de Errores**:
- 400: "Ya existe una moneda con el nombre ..."

---

## 💱 7. EXCHANGE RATES MODULE (Tasas de Cambio)

### 7.1 GET /exchange_rates
**Descripción**: Listar todas las tasas de cambio

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `exchange_rates.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "fromCurrencyId": 1,
    "toCurrencyId": 2,
    "rate": 120.50,
    "date": "2026-01-09"
  }
]
```

**Lógica Frontend**:
1. Tabla: De → A, Tasa, Fecha, Acciones
2. Filtros por moneda origen/destino y rango de fechas

---

### 7.2 GET /exchange_rates/latest/:from/:to
**Descripción**: Obtener última tasa entre dos monedas

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `exchange_rates.read`

**URL Params**: 
- `from`: ID moneda origen
- `to`: ID moneda destino

**Lógica Frontend**:
1. Usar en calculadoras de conversión
2. Widget de conversión en tiempo real

---

### 7.3 POST /exchange_rates
**Descripción**: Crear nueva tasa de cambio

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `exchange_rates.create`

**Request Body**:
```json
{
  "fromCurrencyId": 1,
  "toCurrencyId": 2,
  "rate": 125.00,
  "date": "2026-01-10"
}
```

**Validaciones**:
- fromCurrencyId ≠ toCurrencyId
- Solo una tasa por par de monedas por día

**Lógica Frontend**:
1. Formulario: Moneda Origen, Moneda Destino, Tasa, Fecha
2. Validar que origen ≠ destino

**Manejo de Errores**:
- 400: "La moneda origen y destino no pueden ser iguales"
- 400: "Ya existe una tasa para estas monedas en esta fecha"

---

## 🏷️ 8. CATEGORIES MODULE (Categorías)

### 8.1 GET /categories
**Descripción**: Listar todas las categorías activas

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `categories.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "name": "Electrónica",
    "description": "Productos electrónicos",
    "isActive": true
  }
]
```

**Lógica Frontend**:
1. Vista de tarjetas o lista
2. Badge de estado
3. Usar en dropdown de productos

---

### 8.2 POST /categories
**Descripción**: Crear nueva categoría

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `categories.create`

**Request Body**:
```json
{
  "name": "Herramientas",
  "description": "Herramientas y equipos"
}
```

**Validaciones**:
- name: único, requerido

**Lógica Frontend**:
1. Modal simple: Nombre, Descripción

**Manejo de Errores**:
- 400: "Ya existe una categoría con el nombre ..."

---

## 📦 9. PRODUCTS MODULE (Productos)

### 9.1 GET /products
**Descripción**: Listar todos los productos activos

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `products.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "name": "Laptop HP Pavilion",
    "code": "LAP-HP-001",
    "costPrice": 450.00,
    "salePrice": 650.00,
    "currencyId": 1,
    "unitId": 1,
    "categoryId": 1,
    "isActive": true
  }
]
```

**Lógica Frontend**:
1. Tabla: Código, Nombre, Categoría, Precios, Moneda, Estado
2. Filtros: Categoría, Búsqueda, Rango de precios
3. Calcular margen: `((salePrice - costPrice) / costPrice) * 100`

---

### 9.2 GET /products/category/:categoryId
**Descripción**: Listar productos de una categoría

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `products.read`

**Lógica Frontend**:
1. Usar en vista de categoría específica
2. Sidebar con categorías

---

### 9.3 POST /products
**Descripción**: Crear nuevo producto

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `products.create`

**Request Body**:
```json
{
  "name": "Mouse Logitech",
  "code": "MOU-LOG-001",
  "costPrice": 10.00,
  "salePrice": 15.00,
  "currencyId": 1,
  "unitId": 1,
  "categoryId": 1
}
```


**Validaciones**:
- name: único, requerido
- code: único, requerido
- costPrice, salePrice: positivos

**Lógica Frontend**:
1. Formulario completo: Nombre, Código, Descripción, Categoría, Unidad, Moneda, Precios
2. Calcular margen automáticamente

**Manejo de Errores**:
- 400: "Ya existe un producto con el nombre/código ..."

---

## 💳 10. PAYMENT TYPES MODULE (Tipos de Pago)

### 10.1 GET /payment-types
**Descripción**: Listar todos los tipos de pago activos

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `payment_types.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "type": "Efectivo",
    "description": "Pago en efectivo",
    "isActive": true
  }
]
```

**Lógica Frontend**:
1. Lista: Tipo, Descripción, Estado
2. Usar en módulo de ventas
3. Asociar iconos (💵💳🏦)

---

### 10.2 POST /payment-types
**Descripción**: Crear nuevo tipo de pago

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `payment_types.create`

**Request Body**:
```json
{
  "type": "Transferencia Bancaria",
  "description": "Pago por transferencia"
}
```

**Validaciones**:
- type: único, requerido

**Lógica Frontend**:
1. Formulario: Tipo, Descripción

**Manejo de Errores**:
- 400: "Ya existe un tipo de pago con este nombre"

---

**Resumen**: Con esta guía tienes toda la información necesaria para integrar el frontend con el backend. Cada endpoint está documentado con request/response, lógica de implementación, y manejo de errores. ¡Listo para construir la interfaz completa! 🚀

---

## 📊 11. INVENTORY MODULE (Inventario)

### 11.1 GET /inventory/product/:productId
**Descripción**: Ver stock de un producto en todos los almacenes

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `inventory.read`

**Response Success (200)**:
```json
{
  "productId": 5,
  "productName": "Laptop Dell",
  "productCode": "LAP-001",
  "byWarehouse": [
    {
      "warehouseId": 1,
      "warehouseName": "Almacén Central",
      "quantity": "15.00"
    },
    {
      "warehouseId": 2,
      "warehouseName": "Almacén Sucursal",
      "quantity": "8.00"
    }
  ],
  "totalStock": "23.00"
}
```

**Lógica Frontend**:
1. Card/tabla mostrando stock por almacén
2. Total general destacado
3. Indicadores visuales: verde (>10), amarillo (5-10), rojo (<5)
4. Usar en página de detalle de producto

---

### 11.2 GET /inventory/warehouse/:warehouseId
**Descripción**: Ver stock completo de un almacén

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `inventory.read`

**Response Success (200)**:
```json
{
  "warehouseId": 1,
  "warehouseName": "Almacén Central",
  "products": [
    {
      "productId": 5,
      "productName": "Laptop Dell",
      "productCode": "LAP-001",
      "quantity": "15.00",
      "unitName": "Unidad"
    }
  ]
}
```

**Lógica Frontend**:
1. Tabla de productos con stock
2. Filtros por producto, categoría
3. Exportar a Excel/PDF
4. Búsqueda en tiempo real

---

### 11.3 GET /inventory/kardex/:productId/:warehouseId
**Descripción**: Ver historial de movimientos (kardex)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `inventory.read`

**Response Success (200)**:
```json
{
  "productId": 5,
  "productName": "Laptop Dell",
  "warehouseId": 1,
  "warehouseName": "Almacén Central",
  "movements": [
    {
      "id": 1,
      "type": "PURCHASE",
      "quantity": "10.00",
      "reference": "COMP-2026-00001",
      "reason": null,
      "status": "APPROVED",
      "createdAt": "2026-01-10T10:00:00.000Z",
      "balance": "10.00"
    },
    {
      "id": 2,
      "type": "SALE",
      "quantity": "-2.00",
      "reference": "FV-2026-00001",
      "reason": null,
      "status": "APPROVED",
      "createdAt": "2026-01-10T14:30:00.000Z",
      "balance": "8.00"
    }
  ]
}
```

**Lógica Frontend**:
1. Timeline de movimientos (más recientes arriba)
2. Colores por tipo: azul (PURCHASE), verde (ADJUSTMENT_ENTRY), rojo (SALE/ADJUSTMENT_EXIT)
3. Columna de balance acumulado
4. Filtrar por fecha, tipo
5. Referencias clickeables (abrir compra/venta)

---

### 11.4 POST /inventory/adjust-entry
**Descripción**: Ajuste manual de entrada (agregar inventario)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `inventory.adjust`

**Request Body**:
```json
{
  "productId": 5,
  "warehouseId": 1,
  "quantity": 5,
  "reason": "Corrección por inventario físico - encontradas 5 unidades adicionales"
}
```

**Validaciones**:
- quantity: > 0, requerido
- reason: requerido, min 10 caracteres

**Response Success (201)**:
```json
{
  "message": "Ajuste de entrada registrado exitosamente",
  "movement": {
    "id": 45,
    "reference": "ADJ-1736518800000"
  }
}
```

**Lógica Frontend**:
1. Modal de ajuste con selector de producto y almacén
2. Campo cantidad (solo positivos)
3. TextArea razón (obligatorio, placeholder con ejemplos)
4. Confirmación antes de enviar
5. Actualizar stock en vista inmediatamente

**Casos de uso**:
- "Inventario físico encontró unidades adicionales"
- "Devolución de producto dañado reparado"
- "Corrección de error de conteo"

---

### 11.5 POST /inventory/adjust-exit
**Descripción**: Ajuste manual de salida (retirar inventario)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `inventory.adjust`

**Request Body**:
```json
{
  "productId": 5,
  "warehouseId": 1,
  "quantity": 2,
  "reason": "Producto dañado en almacén - baja por pérdida"
}
```

**Validaciones**:
- quantity: > 0, <= stock actual
- reason: requerido, min 10 caracteres

**Response Success (201)**:
```json
{
  "message": "Ajuste de salida registrado exitosamente",
  "movement": {
    "id": 46,
    "reference": "ADJ-1736519400000"
  }
}
```

**Lógica Frontend**:
1. Modal similar a ajuste de entrada
2. Validar que cantidad no exceda stock actual
3. Alert de confirmación (stock se reducirá)
4. Razón obligatoria

**Casos de uso**:
- "Producto dañado/vencido - baja"
- "Robo/pérdida de inventario"
- "Corrección de error de registro"

---

### 11.6 GET /inventory/reports/value
**Descripción**: Reporte de inventario valorizado

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `inventory.read`

**Query Params (opcional)**:
```
warehouseId: number - Filtrar por almacén
```

**Response**: Ver [REPORTES.md](REPORTES.md#3️⃣-reporte-de-inventario-valorizado)

**Lógica Frontend**:
1. Dashboard con cards de totales por moneda
2. Tabla detallada de productos
3. Gráfico de valorización por almacén
4. Filtro por almacén
5. Exportar a Excel

---

### 11.7 GET /inventory/reports/adjustments
**Descripción**: Reporte de historial de ajustes

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `inventory.read`

**Query Params (obligatorios)**:
```
startDate: string (YYYY-MM-DD) - OBLIGATORIO
endDate: string (YYYY-MM-DD) - OBLIGATORIO
warehouseId: number (opcional)
```

**Response**: Ver [REPORTES.md](REPORTES.md#4️⃣-reporte-de-ajustes-de-inventario)

**Lógica Frontend**:
1. DateRangePicker (obligatorio)
2. Tabla de ajustes con tipo, razón, usuario
3. Filtros por almacén, tipo de ajuste
4. Badge de tipo: verde (ENTRY), rojo (EXIT)

---

## 🛒 12. PURCHASES MODULE (Compras)

### 12.1 GET /purchases
**Descripción**: Listar todas las compras

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `purchases.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "supplierName": "Proveedor XYZ",
    "invoiceNumber": "COMP-2026-00001",
    "date": "2026-01-10",
    "warehouseId": 1,
    "warehouseName": "Almacén Central",
    "currencyId": 1,
    "currencyCode": "USD",
    "status": "APPROVED",
    "subtotal": "5000.00",
    "total": "5000.00",
    "createdBy": 1,
    "acceptedBy": 2,
    "createdAt": "2026-01-10T09:00:00.000Z",
    "acceptedAt": "2026-01-10T10:30:00.000Z"
  }
]
```

**Lógica Frontend**:
1. Tabla: Nro. Factura, Proveedor, Fecha, Almacén, Total, Estado
2. Badge de estado:
   - PENDING: amarillo
   - APPROVED: verde
   - CANCELLED: rojo
3. Filtros: fecha, proveedor, almacén, estado
4. Acciones según estado:
   - PENDING: Editar, Aceptar, Eliminar
   - APPROVED: Ver, Cancelar (si tiene permiso)
   - CANCELLED: Solo ver

---

### 12.2 POST /purchases
**Descripción**: Crear nueva compra en estado PENDING

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `purchases.create`

**Request Body**:
```json
{
  "supplierName": "Proveedor ABC",
  "invoiceNumber": "PROV-2026-001",
  "date": "2026-01-10",
  "warehouseId": 1,
  "currencyId": 1,
  "products": [
    {
      "productId": 5,
      "quantity": 10,
      "unitPrice": 800.00
    },
    {
      "productId": 8,
      "quantity": 50,
      "unitPrice": 2500.00
    }
  ]
}
```

**Validaciones**:
- supplierName: requerido
- invoiceNumber: requerido, único
- date: YYYY-MM-DD, no futuro
- warehouseId: debe existir y tener acceso
- currencyId: debe existir
- products: array mínimo 1 producto
  - productId: debe existir
  - quantity: > 0
  - unitPrice: >= 0

**Response Success (201)**:
```json
{
  "message": "Compra creada exitosamente. Estado: PENDING",
  "purchase": {
    "id": 5,
    "invoiceNumber": "PROV-2026-001",
    "status": "PENDING"
  }
}
```

**Lógica Frontend**:
1. Formulario multi-paso:
   - Paso 1: Datos generales (proveedor, nro, fecha, almacén, moneda)
   - Paso 2: Agregar productos (búsqueda, cantidad, precio)
   - Paso 3: Resumen y confirmación
2. Tabla dinámica de productos:
   - Agregar/quitar productos
   - Calcular subtotales automáticamente
   - Total general
3. Guardar como PENDING primero
4. Luego "Aceptar" para aplicar al inventario

**Manejo de Errores**:
- 400: "La moneda del producto X no coincide con la moneda de la compra"
- 400: "Ya existe una compra con ese número de factura"
- 403: "No tiene acceso al almacén seleccionado"

---

### 12.3 PUT /purchases/:id
**Descripción**: Actualizar compra en estado PENDING

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `purchases.update`

**Request Body**: Igual que POST

**Response Success (200)**:
```json
{
  "message": "Compra actualizada exitosamente"
}
```

**Lógica Frontend**:
1. Solo permitir edición si estado = PENDING
2. Cargar datos con GET /purchases/:id
3. Pre-llenar formulario
4. Permitir modificar todos los campos
5. Mensaje si intenta editar APPROVED/CANCELLED

---

### 12.4 PUT /purchases/:id/accept
**Descripción**: Aceptar compra y actualizar inventario

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `purchases.update`

**Response Success (200)**:
```json
{
  "message": "Compra aceptada. Inventario actualizado exitosamente"
}
```

**Lógica Frontend**:
1. Botón "Aceptar Compra" solo si PENDING
2. Modal de confirmación:
   - "¿Aceptar compra COMP-2026-00001?"
   - "Se agregará inventario al almacén X"
   - Mostrar resumen de productos
3. Al aceptar:
   - Enviar PUT /purchases/:id/accept
   - Mostrar loading
   - Mensaje de éxito
   - Actualizar lista (estado = APPROVED)

**Efectos**:
- Estado cambia a APPROVED
- Se crean movimientos de inventario tipo PURCHASE
- Stock se incrementa automáticamente

---

### 12.5 PUT /purchases/:id/cancel
**Descripción**: Cancelar compra (revierte inventario si estaba APPROVED)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `purchases.delete`

**Request Body**:
```json
{
  "cancellationReason": "Factura duplicada en el sistema"
}
```

**Validaciones**:
- cancellationReason: requerido, min 10 caracteres

**Response Success (200)**:
```json
{
  "message": "Compra cancelada. Inventario revertido exitosamente"
}
```

**Lógica Frontend**:
1. Botón "Cancelar Compra" solo si APPROVED
2. Modal con campo de razón (obligatorio)
3. Advertencia: "Esto revertirá el inventario agregado"
4. Confirmación adicional
5. Actualizar vista

**Efectos**:
- Estado cambia a CANCELLED
- Si estaba APPROVED: se revierten los movimientos de inventario
- No se puede cancelar si ya no hay stock suficiente

---

### 12.6 DELETE /purchases/:id
**Descripción**: Eliminar compra en PENDING

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `purchases.delete`

**Response Success (200)**:
```json
{
  "message": "Compra eliminada exitosamente"
}
```

**Lógica Frontend**:
1. Solo permitir si estado = PENDING
2. Confirmación: "¿Eliminar compra? Esta acción no se puede deshacer"
3. Remover de lista

---

## 💵 13. SALES MODULE (Ventas)

### 13.1 GET /sales
**Descripción**: Listar todas las ventas

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `sales.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "invoiceNumber": "FV-2026-00001",
    "customerName": "Cliente ABC",
    "date": "2026-01-10",
    "warehouseId": 1,
    "warehouseName": "Almacén Central",
    "currencyId": 1,
    "currencyCode": "USD",
    "paymentTypeId": 1,
    "paymentType": "Efectivo",
    "status": "APPROVED",
    "subtotal": "2400.00",
    "total": "2400.00",
    "createdBy": 1,
    "acceptedBy": 1,
    "createdAt": "2026-01-10T14:00:00.000Z",
    "acceptedAt": "2026-01-10T14:05:00.000Z"
  }
]
```

**Lógica Frontend**:
1. Tabla: Nro. Factura, Cliente, Fecha, Total, Tipo Pago, Estado
2. Badge de estado (igual que compras)
3. Filtros: fecha, cliente, almacén, tipo pago, estado
4. Botón "Nueva Venta" prominente
5. Vista resumen: ventas del día, mes

---

### 13.2 POST /sales
**Descripción**: Crear nueva venta (valida stock disponible)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `sales.create`

**Request Body**:
```json
{
  "invoiceNumber": "FV-2026-00015",
  "customerName": "Cliente XYZ",
  "date": "2026-01-10",
  "warehouseId": 1,
  "currencyId": 1,
  "paymentTypeId": 1,
  "products": [
    {
      "productId": 5,
      "quantity": 2,
      "unitPrice": 1200.00
    }
  ]
}
```

**Validaciones**:
- Stock: valida que haya suficiente inventario en el almacén
- Moneda: producto debe estar en la misma moneda que la venta
- unitPrice: opcional, usa salePrice del producto si no se especifica

**Response Success (201)**:
```json
{
  "message": "Venta creada exitosamente. Estado: PENDING",
  "sale": {
    "id": 15,
    "invoiceNumber": "FV-2026-00015",
    "status": "PENDING"
  }
}
```

**Lógica Frontend**:
1. Formulario similar a compras pero con:
   - Campo de tipo de pago (dropdown)
   - Validación de stock en tiempo real
   - Precio sugerido = salePrice del producto
2. Al seleccionar producto:
   - Consultar GET /inventory/product/:id
   - Mostrar stock disponible por almacén
   - Validar que cantidad <= stock
   - Alert si stock bajo
3. Calcular total automáticamente
4. Guardar como PENDING, luego "Facturar" para aplicar

**Manejo de Errores**:
- 400: "Stock insuficiente para el producto X en el almacén Y"
- 400: "La moneda del producto no coincide"

---

### 13.3 PUT /sales/:id/accept
**Descripción**: Aceptar/facturar venta (descuenta inventario)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `sales.update`

**Response Success (200)**:
```json
{
  "message": "Venta aceptada. Inventario actualizado exitosamente"
}
```

**Lógica Frontend**:
1. Botón "Facturar" solo si PENDING
2. Confirmación con resumen
3. Al facturar:
   - Estado = APPROVED
   - Stock se descuenta
   - Generar PDF de factura (opcional)

**Efectos**:
- Movimientos SALE en inventario
- Stock se reduce

---

### 13.4 PUT /sales/:id/cancel
**Descripción**: Cancelar venta (devuelve inventario)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `sales.delete`

**Request Body**:
```json
{
  "cancellationReason": "Cliente desistió de la compra"
}
```

**Response Success (200)**:
```json
{
  "message": "Venta cancelada. Inventario revertido exitosamente"
}
```

**Lógica Frontend**:
1. Botón "Anular Venta" solo si APPROVED
2. Modal con razón obligatoria
3. Advertencia: "Se devolverá el stock al almacén"
4. Confirmación
5. Actualizar lista

---

### 13.5 GET /sales/reports/totals
**Descripción**: Reporte de ventas totales con conversión de moneda

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `sales.read`

**Query Params (obligatorios)**:
```
startDate: string (YYYY-MM-DD) - OBLIGATORIO
endDate: string (YYYY-MM-DD) - OBLIGATORIO
targetCurrencyId: number - OBLIGATORIO
```

**Response**: Ver [REPORTES.md](REPORTES.md#1️⃣-reporte-de-ventas-totales-con-conversión-de-moneda)

**Lógica Frontend**:
1. Dashboard de ventas con:
   - DateRangePicker
   - Selector de moneda objetivo
   - Botón "Generar Reporte"
2. Visualización:
   - Cards con totales por almacén
   - Gráfico de barras por moneda
   - Tabla detallada
   - Total general convertido destacado
3. Exportar a Excel/PDF

---

### 13.6 GET /sales/reports/cancelled
**Descripción**: Reporte de ventas canceladas

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `sales.read`

**Query Params (obligatorios)**:
```
startDate: string (YYYY-MM-DD) - OBLIGATORIO
endDate: string (YYYY-MM-DD) - OBLIGATORIO
```

**Response**: Ver [REPORTES.md](REPORTES.md#2️⃣-reporte-de-ventas-canceladas)

**Lógica Frontend**:
1. DateRangePicker obligatorio
2. Tabla: Nro. Factura, Cliente, Fecha, Total, Razón, Usuario que canceló
3. Filtros adicionales por cliente, almacén
4. Badge rojo para identificar canceladas

---

## 🔄 14. TRANSFERS MODULE (Traslados)

### 14.1 GET /transfers
**Descripción**: Listar todos los traslados

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `transfers.read`

**Response Success (200)**:
```json
[
  {
    "id": 1,
    "date": "2026-01-10",
    "originWarehouseId": 1,
    "originWarehouseName": "Almacén Central",
    "destinationWarehouseId": 2,
    "destinationWarehouseName": "Almacén Sucursal",
    "status": "APPROVED",
    "notes": "Traslado de inventario mensual",
    "createdBy": 1,
    "acceptedBy": 3,
    "createdAt": "2026-01-10T08:00:00.000Z",
    "acceptedAt": "2026-01-10T10:00:00.000Z"
  }
]
```

**Lógica Frontend**:
1. Tabla: Fecha, Origen → Destino, Estado, Productos
2. Badge de estado:
   - PENDING: amarillo
   - APPROVED: verde
   - REJECTED: rojo
3. Vista separada:
   - "Traslados enviados" (origen en mis almacenes)
   - "Traslados recibidos" (destino en mis almacenes)
4. Acciones según rol:
   - Almacén origen (PENDING): Editar, Eliminar
   - Almacén destino (PENDING): Aceptar, Rechazar

---

### 14.2 POST /transfers
**Descripción**: Crear nuevo traslado

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `transfers.create`

**Request Body**:
```json
{
  "date": "2026-01-10",
  "originWarehouseId": 1,
  "destinationWarehouseId": 2,
  "notes": "Traslado de exceso de inventario",
  "products": [
    {
      "productId": 5,
      "quantity": 10
    },
    {
      "productId": 8,
      "quantity": 25
    }
  ]
}
```

**Validaciones**:
- originWarehouseId: debe tener acceso
- destinationWarehouseId: debe existir
- Origen ≠ destino
- products: mínimo 1 producto
- Stock: valida que haya suficiente en origen

**Response Success (201)**:
```json
{
  "message": "Traslado creado exitosamente. Estado: PENDING",
  "transfer": {
    "id": 12,
    "status": "PENDING"
  }
}
```

**Lógica Frontend**:
1. Formulario:
   - Fecha
   - Almacén origen (dropdown de mis almacenes)
   - Almacén destino (dropdown de todos excepto origen)
   - Notas/observaciones
2. Tabla de productos:
   - Al seleccionar producto: mostrar stock en origen
   - Validar cantidad <= stock
   - Agregar/quitar productos
3. Crear como PENDING
4. Esperar aceptación del almacén destino

---

### 14.3 PUT /transfers/:id/accept
**Descripción**: Aceptar traslado (mueve inventario)

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `transfers.update`

**Response Success (200)**:
```json
{
  "message": "Traslado aceptado. Inventario movido exitosamente"
}
```

**Lógica Frontend**:
1. Botón "Aceptar Traslado" solo si:
   - Estado = PENDING
   - Usuario tiene acceso al almacén destino
2. Modal de confirmación:
   - "¿Aceptar traslado del Almacén X?"
   - Mostrar lista de productos
3. Al aceptar:
   - Estado = APPROVED
   - Stock se descuenta de origen
   - Stock se incrementa en destino

**Efectos**:
- Movimientos TRANSFER_OUT en origen
- Movimientos TRANSFER_IN en destino

---

### 14.4 PUT /transfers/:id/reject
**Descripción**: Rechazar traslado

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `transfers.update`

**Request Body**:
```json
{
  "rejectionReason": "Stock insuficiente en destino para recibir"
}
```

**Response Success (200)**:
```json
{
  "message": "Traslado rechazado"
}
```

**Lógica Frontend**:
1. Botón "Rechazar" solo si:
   - Estado = PENDING
   - Usuario tiene acceso al almacén destino
2. Modal con razón obligatoria
3. Confirmación
4. Actualizar lista (estado = REJECTED)

---

### 14.5 GET /transfers/reports/rejected
**Descripción**: Reporte de traslados rechazados

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `transfers.read`

**Query Params (obligatorios)**:
```
startDate: string (YYYY-MM-DD) - OBLIGATORIO
endDate: string (YYYY-MM-DD) - OBLIGATORIO
```

**Response**: Ver [REPORTES.md](REPORTES.md#5️⃣-reporte-de-traslados-rechazados)

**Lógica Frontend**:
1. DateRangePicker obligatorio
2. Resumen por razón de rechazo (gráfico de dona)
3. Tabla detallada de cada traslado rechazado
4. Filtros por almacén, usuario que rechazó

---

## 🎨 15. COMPONENTES UI SUGERIDOS

### 15.1 StatusBadge
```jsx
<StatusBadge status="PENDING" />
<StatusBadge status="APPROVED" />
<StatusBadge status="CANCELLED" />
<StatusBadge status="REJECTED" />
```

### 15.2 StockIndicator
```jsx
<StockIndicator quantity={15} threshold={10} />
// Verde si > threshold
// Amarillo si 5-threshold
// Rojo si < 5
```

### 15.3 DateRangePicker
```jsx
<DateRangePicker
  startDate={startDate}
  endDate={endDate}
  onChange={(start, end) => { /* ... */ }}
  required={true}
/>
```

### 15.4 ProductSelector
```jsx
<ProductSelector
  onSelect={(product) => { /* ... */ }}
  warehouseId={warehouseId}
  showStock={true}
/>
```

### 15.5 CurrencyFormat
```jsx
<CurrencyFormat
  value={1200.50}
  currency="USD"
  // Muestra: $1,200.50
/>
```

---

## 📝 16. VALIDACIONES COMUNES

### Stock Validation
```javascript
const validateStock = async (productId, warehouseId, quantity) => {
  const response = await api.get(`/inventory/product/${productId}`);
  const warehouse = response.data.byWarehouse.find(w => w.warehouseId === warehouseId);
  
  if (!warehouse || parseFloat(warehouse.quantity) < quantity) {
    throw new Error(`Stock insuficiente. Disponible: ${warehouse?.quantity || 0}`);
  }
};
```

### Currency Validation
```javascript
const validateCurrency = (productCurrency, documentCurrency) => {
  if (productCurrency !== documentCurrency) {
    throw new Error('La moneda del producto no coincide con la moneda del documento');
  }
};
```

### Date Validation
```javascript
const validateDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) {
    throw new Error('Debe seleccionar un rango de fechas');
  }
  
  if (new Date(startDate) > new Date(endDate)) {
    throw new Error('La fecha inicial no puede ser mayor que la fecha final');
  }
};
```

---

## 🔔 17. NOTIFICACIONES Y MENSAJES

### Éxito
- ✅ "Compra aceptada. Inventario actualizado"
- ✅ "Venta cancelada. Stock devuelto al almacén"
- ✅ "Traslado aprobado. Productos movidos exitosamente"

### Advertencias
- ⚠️ "Stock bajo: solo quedan 3 unidades"
- ⚠️ "Esta acción revertirá el inventario"
- ⚠️ "No podrá editar después de aceptar"

### Errores
- ❌ "Stock insuficiente para completar la venta"
- ❌ "No tiene acceso a este almacén"
- ❌ "Debe seleccionar al menos un producto"

---

## 📊 18. DASHBOARDS SUGERIDOS

### Dashboard de Inventario
- Card: Total de productos
- Card: Valor total del inventario (por moneda)
- Gráfico: Stock por almacén
- Tabla: Productos con stock bajo (<5)
- Timeline: Últimos movimientos

### Dashboard de Ventas
- Card: Ventas del día
- Card: Ventas del mes
- Card: Ticket promedio
- Gráfico: Ventas por día (últimos 30 días)
- Tabla: Top 10 productos más vendidos

### Dashboard de Compras
- Card: Compras pendientes de aprobación
- Card: Total comprado este mes
- Tabla: Últimas compras
- Proveedores principales

### Dashboard de Traslados
- Card: Traslados pendientes (recibidos)
- Card: Traslados enviados este mes
- Tabla: Traslados pendientes de aceptación
- Mapa de flujo entre almacenes

---

## 🎯 19. MEJORES PRÁCTICAS

### 1. Caché de Datos
```javascript
// Cachear catálogos que no cambian frecuentemente
const { data: units } = useQuery('units', fetchUnits, {
  staleTime: 1000 * 60 * 60 // 1 hora
});

const { data: currencies } = useQuery('currencies', fetchCurrencies, {
  staleTime: 1000 * 60 * 60
});
```

### 2. Optimistic Updates
```javascript
// Al crear una venta, actualizar UI inmediatamente
const mutation = useMutation(createSale, {
  onMutate: async (newSale) => {
    // Optimistic update
    queryClient.setQueryData('sales', (old) => [...old, newSale]);
  },
  onError: (err, newSale, context) => {
    // Revertir si falla
    queryClient.setQueryData('sales', context.previousSales);
  }
});
```

### 3. Lazy Loading
```javascript
// Cargar reportes solo cuando se necesitan
const SalesReports = lazy(() => import('./pages/SalesReports'));

<Suspense fallback={<Loading />}>
  <SalesReports />
</Suspense>
```

### 4. Validación en Tiempo Real
```javascript
// Al escribir cantidad, validar stock inmediatamente
const handleQuantityChange = debounce(async (quantity) => {
  if (selectedProduct && selectedWarehouse) {
    await validateStock(selectedProduct.id, selectedWarehouse.id, quantity);
  }
}, 500);
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Configuración Inicial
- [ ] Configurar axios interceptors
- [ ] Implementar refresh token logic
- [ ] Crear ProtectedRoute component
- [ ] Configurar state management (Context/Redux/Zustand)

### Autenticación
- [ ] Página de login
- [ ] Logout functionality
- [ ] Change password modal
- [ ] Session persistence

### Módulos Base
- [ ] Users CRUD
- [ ] Roles CRUD
- [ ] Warehouses CRUD
- [ ] Units, Currencies, Categories, Products CRUD

### Módulos Operacionales
- [ ] Inventory (stock, kardex, ajustes)
- [ ] Purchases (CRUD, accept, cancel)
- [ ] Sales (CRUD, accept, cancel)
- [ ] Transfers (CRUD, accept, reject)

### Reportes
- [ ] Sales totals report
- [ ] Cancelled sales report
- [ ] Inventory value report
- [ ] Adjustments report
- [ ] Rejected transfers report

### UI/UX
- [ ] StatusBadge component
- [ ] StockIndicator component
- [ ] DateRangePicker component
- [ ] ProductSelector component
- [ ] CurrencyFormat component
- [ ] Loading states
- [ ] Error boundaries
- [ ] Toast notifications

### Testing
- [ ] Unit tests para servicios
- [ ] Integration tests para flujos críticos
- [ ] E2E tests para compras/ventas

---

**Total de endpoints documentados: 76**
**Módulos completos: 14**
**Reportes: 5**

Para más detalles técnicos, ver [context.md](context.md)
Para documentación de reportes, ver [REPORTES.md](REPORTES.md)
