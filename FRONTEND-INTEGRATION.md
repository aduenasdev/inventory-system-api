# Guía de Integración Frontend - Inventory System API

## 🔐 Sistema de Autenticación

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
    "createdAt": "2025-01-09T10:00:00.000Z"
  }
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
  "createdAt": "2025-01-09T10:00:00.000Z",
  "roles": [
    {
      "id": 1,
      "name": "Admin",
      "description": "Administrador del sistema"
    }
  ],
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
   - Email, roles, almacenes, última sesión
4. Agregar filtros por email, rol
5. Agregar paginación si hay muchos usuarios
6. Botones de acción: Editar, Eliminar (según permisos)

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
- roleIds: array con al menos 1 rol (requerido)
- warehouseIds: array opcional

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
1. Formulario con campos: email, password, confirm password
2. Multi-select para roles (cargar de GET /roles)
3. Multi-select para almacenes (cargar de GET /warehouses)
4. Validar formulario localmente antes de enviar
5. Enviar POST a `/users`
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

**Request Body** (ambos campos opcionales):
```json
{
  "email": "actualizado@example.com",
  "password": "NewPass123"
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
2. Formulario pre-llenado con email actual
3. Campo password opcional (vacío = no cambiar)
4. Validar cambios antes de enviar
5. Enviar PUT con solo los campos modificados

**Nota**: Para cambiar roles/almacenes usar los endpoints específicos (2.6 y 2.7)

---

### 2.5 DELETE /users/:id
**Descripción**: Eliminar usuario del sistema

**Headers**: `Authorization: Bearer <accessToken>`

**Permiso requerido**: `users.delete`

**Response Success (200)**:
```json
{
  "message": "Usuario eliminado exitosamente"
}
```

**Lógica Frontend**:
1. Botón "Eliminar" solo visible con permiso `users.delete`
2. Mostrar confirmación: "¿Estás seguro de eliminar a [email]?"
3. Enviar DELETE a `/users/:id`
4. Actualizar lista de usuarios (refetch o eliminar localmente)
5. Mostrar notificación de éxito

**Precaución**: Eliminar usuario elimina en cascada sus relaciones (roles, almacenes)

---

### 2.6 POST /users/:userId/roles
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

### 2.7 POST /users/:userId/warehouses
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

**Permisos disponibles (14 total)**:
- **users**: read, create, update, delete, assign_roles, assign_warehouses
- **warehouses**: read, create, update, delete
- **roles**: read, create, update, delete

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
2. Advertir sobre eliminación en cascada (usuarios asignados)
3. Enviar DELETE
4. Actualizar lista

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

**Resumen**: Con esta guía tienes toda la información necesaria para integrar el frontend con el backend. Cada endpoint está documentado con request/response, lógica de implementación, y manejo de errores. ¡Listo para construir la interfaz completa! 🚀
