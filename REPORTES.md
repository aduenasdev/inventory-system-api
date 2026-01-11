# 📊 Documentación de Reportes

## 📚 Navegación de Documentación

- 📖 **[README.md](README.md)** - Visión general, instalación y arquitectura
- 🔧 **[context.md](context.md)** - Documentación técnica completa con ejemplos CURL
- 🎨 **[FRONTEND-INTEGRATION.md](FRONTEND-INTEGRATION.md)** - Guía de integración con frontend
- 📊 **[REPORTES.md](REPORTES.md)** - Documentación de reportes y analytics (estás aquí)

---

## 🎯 Resumen General

Se implementaron 5 reportes completos que permiten análisis detallado de ventas, inventario, ajustes y traslados rechazados. Todos los reportes **filtran automáticamente** por los almacenes asignados al usuario autenticado.

---

## 1️⃣ Reporte de Ventas Totales con Conversión de Moneda

**Endpoint:** `GET /sales/reports/totals`

**Descripción:** Genera un reporte completo de ventas por período, agrupado por almacén y moneda, con conversión a una moneda objetivo.

### Parámetros (Query):
```
startDate: string (YYYY-MM-DD) - Fecha inicio
endDate: string (YYYY-MM-DD) - Fecha fin
targetCurrencyId: number - ID de la moneda para conversión
```

### Ejemplo de solicitud:
```http
GET /sales/reports/totals?startDate=2026-01-01&endDate=2026-01-31&targetCurrencyId=1
Authorization: Bearer {accessToken}
```

### Respuesta JSON:
```json
{
  "period": {
    "startDate": "2026-01-01",
    "endDate": "2026-01-31"
  },
  "targetCurrency": {
    "id": 1,
    "code": "USD",
    "name": "Dólar Estadounidense"
  },
  "byWarehouse": [
    {
      "warehouseId": 1,
      "warehouseName": "Almacén Central",
      "invoiceCount": 45,
      "byCurrency": [
        {
          "currency": "USD",
          "code": "USD",
          "total": "3500.00"
        },
        {
          "currency": "CUP",
          "code": "CUP",
          "total": "85000.00"
        }
      ],
      "totalInTargetCurrency": "6950.00"
    },
    {
      "warehouseId": 2,
      "warehouseName": "Almacén Sucursal Norte",
      "invoiceCount": 32,
      "byCurrency": [
        {
          "currency": "USD",
          "code": "USD",
          "total": "2800.00"
        }
      ],
      "totalInTargetCurrency": "2800.00"
    }
  ],
  "overall": {
    "totalInvoices": 77,
    "byCurrency": [
      {
        "currency": "USD",
        "total": "6300.00"
      },
      {
        "currency": "CUP",
        "total": "85000.00"
      }
    ],
    "totalInTargetCurrency": "9750.00"
  }
}
```

### Características:
- ✅ Solo ventas **APPROVED** (aceptadas)
- ✅ Filtrado por almacenes del usuario
- ✅ Agrupación por almacén individual
- ✅ Subtotales por cada moneda original
- ✅ **Conversión usando tasa del día de la venta**
- ✅ Total general convertido a moneda objetivo
- ✅ Conteo de facturas por almacén

---

## 2️⃣ Reporte de Ventas Canceladas

**Endpoint:** `GET /sales/reports/cancelled`

**Descripción:** Lista todas las ventas canceladas con información del usuario que las canceló y el motivo.

### Parámetros (Query - **obligatorios**):
```
startDate: string (YYYY-MM-DD) - Fecha inicio (obligatorio)
endDate: string (YYYY-MM-DD) - Fecha fin (obligatorio)
```

### Ejemplo de solicitud:
```http
GET /sales/reports/cancelled?startDate=2026-01-01&endDate=2026-01-31
Authorization: Bearer {accessToken}
```

### Respuesta JSON:
```json
[
  {
    "id": 15,
    "invoiceNumber": "FV-2026-00015",
    "customerName": "Cliente XYZ",
    "date": "2026-01-15",
    "warehouseId": 1,
    "currencyId": 1,
    "status": "CANCELLED",
    "subtotal": "500.00",
    "total": "500.00",
    "cancellationReason": "Cliente desistió de la compra",
    "createdBy": 2,
    "cancelledBy": 3,
    "createdAt": "2026-01-15T10:30:00.000Z",
    "cancelledAt": "2026-01-15T14:45:00.000Z"
  }
]
```

### Características:
- ✅ Solo facturas con estado **CANCELLED**
- ✅ Incluye razón de cancelación
- ✅ Usuario que creó y usuario que canceló
- ✅ Fecha de creación y cancelación
- ✅ **Rango de fechas obligatorio** (previene consultas sin límite)

---

## 3️⃣ Reporte de Inventario Valorizado

**Endpoint:** `GET /inventory/reports/value`

**Descripción:** Muestra el valor total del inventario actual por almacén, agrupado por moneda de cada producto.

### Parámetros (Query - opcional):
```
warehouseId: number - Filtrar por almacén específico
```

### Ejemplo de solicitud:
```http
GET /inventory/reports/value
Authorization: Bearer {accessToken}
```

O para un almacén específico:
```http
GET /inventory/reports/value?warehouseId=1
Authorization: Bearer {accessToken}
```

### Respuesta JSON:
```json
{
  "byWarehouse": [
    {
      "warehouseId": 1,
      "warehouseName": "Almacén Central",
      "productCount": 25,
      "products": [
        {
          "productId": 5,
          "productName": "Laptop Dell",
          "productCode": "LAP-001",
          "quantity": "10.00",
          "costPrice": "800.00",
          "salePrice": "1200.00",
          "currency": "USD",
          "totalCost": "8000.00",
          "totalSale": "12000.00"
        },
        {
          "productId": 8,
          "productName": "Teclado Mecánico",
          "productCode": "TEC-001",
          "quantity": "50.00",
          "costPrice": "2500.00",
          "salePrice": "3500.00",
          "currency": "CUP",
          "totalCost": "125000.00",
          "totalSale": "175000.00"
        }
      ],
      "byCurrency": [
        {
          "currency": "Dólar Estadounidense",
          "code": "USD",
          "totalCost": "45000.00",
          "totalSale": "67500.00",
          "productCount": 15
        },
        {
          "currency": "Peso Cubano",
          "code": "CUP",
          "totalCost": "280000.00",
          "totalSale": "420000.00",
          "productCount": 10
        }
      ]
    }
  ],
  "overall": {
    "totalProducts": 25,
    "byCurrency": [
      {
        "currency": "Dólar Estadounidense",
        "code": "USD",
        "totalCost": "45000.00",
        "totalSale": "67500.00",
        "productCount": 15
      },
      {
        "currency": "Peso Cubano",
        "code": "CUP",
        "totalCost": "280000.00",
        "totalSale": "420000.00",
        "productCount": 10
      }
    ]
  }
}
```

### Características:
- ✅ **Stock actual** por almacén y producto
- ✅ Valorización usando `costPrice` y `salePrice` de cada producto
- ✅ Agrupación por moneda de producto
- ✅ Total valorizado a precio de costo y precio de venta
- ✅ Conteo de productos por moneda
- ✅ Detalle completo de cada producto con cantidades
- ✅ Filtrado por almacenes del usuario

---

## 4️⃣ Reporte de Ajustes de Inventario

**Endpoint:** `GET /inventory/reports/adjustments`

**Descripción:** Historial completo de todos los ajustes de inventario (entradas y salidas manuales).

### Parámetros (Query):
```
startDate: string (YYYY-MM-DD) - Fecha inicio (obligatorio)
endDate: string (YYYY-MM-DD) - Fecha fin (obligatorio)
warehouseId: number - Filtrar por almacén (opcional)
```

### Ejemplo de solicitud:
```http
GET /inventory/reports/adjustments?startDate=2026-01-01&endDate=2026-01-31
Authorization: Bearer {accessToken}
```

### Respuesta JSON:
```json
[
  {
    "id": 45,
    "type": "ADJUSTMENT_ENTRY",
    "status": "APPROVED",
    "warehouseId": 1,
    "warehouseName": "Almacén Central",
    "productId": 5,
    "productName": "Laptop Dell",
    "productCode": "LAP-001",
    "quantity": "5.00",
    "reference": "ADJ-1736518800000",
    "reason": "Corrección por inventario físico - encontradas 5 unidades adicionales",
    "createdAt": "2026-01-10T15:30:00.000Z"
  },
  {
    "id": 46,
    "type": "ADJUSTMENT_EXIT",
    "status": "APPROVED",
    "warehouseId": 2,
    "warehouseName": "Almacén Sucursal",
    "productId": 8,
    "productName": "Teclado Mecánico",
    "productCode": "TEC-001",
    "quantity": "2.00",
    "reference": "ADJ-1736519400000",
    "reason": "Producto dañado en almacén - baja por pérdida",
    "createdAt": "2026-01-10T16:45:00.000Z"
  }
]
```

### Características:
- ✅ Solo movimientos tipo **ADJUSTMENT_ENTRY** y **ADJUSTMENT_EXIT**
- ✅ Todos los ajustes están **APPROVED** (se aprueban al crearlos)
- ✅ Incluye información del almacén y producto
- ✅ Referencia única del ajuste
- ✅ **Razón detallada** del ajuste
- ✅ **Rango de fechas obligatorio** (previene consultas sin límite)
- ✅ Filtrado opcional por almacén
- ✅ Ordenado por fecha descendente (más recientes primero)

---

## 5️⃣ Reporte de Traslados Rechazados

**Endpoint:** `GET /transfers/reports/rejected`

**Descripción:** Lista todos los traslados rechazados, agrupados por razón de rechazo, con detalles completos.

### Parámetros (Query - **obligatorios**):
```
startDate: string (YYYY-MM-DD) - Fecha inicio (obligatorio)
endDate: string (YYYY-MM-DD) - Fecha fin (obligatorio)
```

### Ejemplo de solicitud:
```http
GET /transfers/reports/rejected?startDate=2026-01-01&endDate=2026-01-31
Authorization: Bearer {accessToken}
```

### Respuesta JSON:
```json
{
  "summary": [
    {
      "reason": "Stock insuficiente en destino",
      "count": 3
    },
    {
      "reason": "Productos no coinciden con lo solicitado",
      "count": 2
    },
    {
      "reason": "Almacén destino cerrado temporalmente",
      "count": 1
    }
  ],
  "details": [
    {
      "id": 12,
      "date": "2026-01-15",
      "originWarehouseId": 1,
      "destinationWarehouseId": 2,
      "status": "REJECTED",
      "notes": "Traslado urgente",
      "rejectionReason": "Stock insuficiente en destino",
      "createdBy": 2,
      "rejectedBy": 5,
      "rejectedByName": "Juan Pérez",
      "createdAt": "2026-01-15T09:00:00.000Z",
      "rejectedAt": "2026-01-15T10:30:00.000Z",
      "details": [
        {
          "id": 23,
          "productId": 5,
          "productName": "Laptop Dell",
          "productCode": "LAP-001",
          "quantity": "10.00"
        },
        {
          "id": 24,
          "productId": 8,
          "productName": "Teclado Mecánico",
          "productCode": "TEC-001",
          "quantity": "25.00"
        }
      ]
    }
  ]
}
```

### Características:
- ✅ Solo traslados con estado **REJECTED**
- ✅ **Resumen agrupado** por razón de rechazo
- ✅ Conteo de traslados por cada razón
- ✅ Listado detallado completo
- ✅ Incluye usuario que rechazó y su nombre
- ✅ Productos incluidos en cada traslado
- ✅ Almacenes origen y destino
- ✅ Fechas de creación y rechazo
- ✅ **Rango de fechas obligatorio** (previene consultas sin límite)

---

## 🔒 Seguridad y Filtrado

### Todos los reportes implementan:

1. **Autenticación requerida:** Token JWT válido en header `Authorization: Bearer {token}`
2. **Autorización por permisos:** 
   - Ventas: requiere permiso `sales.read`
   - Inventario: requiere permiso `inventory.read`
   - Traslados: requiere permiso `transfers.read`
3. **Filtrado automático por usuario:**
   - Solo muestra datos de almacenes asignados al usuario autenticado
   - Consulta automática a tabla `user_warehouses`
   - No es posible ver datos de almacenes no autorizados

---

## 💡 Casos de Uso

### Ventas Totales:
```bash
# Ver ventas del mes en USD
curl -X GET "http://localhost:3000/sales/reports/totals?startDate=2026-01-01&endDate=2026-01-31&targetCurrencyId=1" \
  -H "Authorization: Bearer {token}"
```

### Inventario Valorizado:
```bash
# Ver valor total del inventario
curl -X GET "http://localhost:3000/inventory/reports/value" \
  -H "Authorization: Bearer {token}"

# Ver valor de un almacén específico
curl -X GET "http://localhost:3000/inventory/reports/value?warehouseId=1" \
  -H "Authorization: Bearer {token}"
```

### Ajustes de Inventario:
```bash
# Ver todos los ajustes del mes
curl -X GET "http://localhost:3000/inventory/reports/adjustments?startDate=2026-01-01&endDate=2026-01-31" \
  -H "Authorization: Bearer {token}"
```

### Traslados Rechazados:
```bash
# Ver traslados rechazados del trimestre con resumen
curl -X GET "http://localhost:3000/transfers/reports/rejected?startDate=2026-01-01&endDate=2026-03-31" \
  -H "Authorization: Bearer {token}"
```

### Ventas Canceladas:
```bash
# Ver ventas canceladas del mes
curl -X GET "http://localhost:3000/sales/reports/cancelled?startDate=2026-01-01&endDate=2026-01-31" \
  -H "Authorization: Bearer {token}"
```

---

## 📝 Notas Técnicas

### Conversión de Monedas:
- Usa la tasa de cambio **del día de la venta** (no la actual)
- Si no existe tasa para ese día, muestra error descriptivo
- La conversión se calcula en tiempo real al generar el reporte

### Performance:
- Los reportes usan JOINs optimizados
- Filtrado a nivel de base de datos
- Agrupaciones en memoria para reportes complejos

### Errores Comunes:
```json
{
  "message": "No tiene acceso a este almacén"
}
```
Usuario intentó consultar un almacén al que no tiene acceso.

```json
{
  "message": "No existe tasa de cambio para la fecha 2026-01-15 entre las monedas especificadas"
}
```
Falta tasa de cambio para convertir en el reporte de ventas totales.

---

## 🚀 Próximos Reportes Sugeridos

1. **Reporte de Productos Más Vendidos:** Top 10 por período
2. **Reporte de Rotación de Inventario:** Días promedio en almacén
3. **Reporte de Margen de Ganancia:** Análisis por producto/categoría
4. **Reporte de Compras vs Ventas:** Comparativo por período
5. **Reporte de Stock Bajo:** Productos con cantidad mínima
6. **Reporte de Facturación por Usuario:** Ventas por vendedor

---

## 📞 Soporte

Para dudas o nuevos reportes, contactar al equipo de desarrollo.
