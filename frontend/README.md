# Panel Cobrix

React 19, TypeScript, Vite y Tailwind CSS 4. El panel solo habla con el backend de Cobrix (`VITE_COBRIX_API_URL`), nunca directamente con la API del administrador.

```bash
cp .env.example .env    # VITE_COBRIX_API_URL=http://127.0.0.1:4320
npm install
npm run dev             # http://localhost:5173
npm test                # formatos y etiquetas (runner nativo de Node)
npm run build
```

| Ruta | Pantalla |
| --- | --- |
| `/` | Resumen: totales, alertas, antigüedad de la deuda, proveedor, corrida automática, últimas corridas y accesos rápidos |
| `/clientes` | Tabla paginada con búsqueda por nombre, cédula o RIF (el backend normaliza `V-12.345.678`), filtros y orden |
| `/clientes/:documento` | Expediente: totales, datos, contratos, facturas e historial |
| `/sincronizacion` | Importar y Actualizar pagadas (cada una con su «Simular»), progreso en vivo e historial |
| `/sincronizacion/:id` | Detalle de una corrida: contadores destacados, todos los contadores y una fila por cuota con filtro y búsqueda |
| `/configuracion` | Empresa, proveedor (probar conexión y guardar), reglas de importación y corrida automática |

- `src/lib/format.ts`: montos con su moneda (`USD 1.235,00`), fechas en la zona horaria de la empresa (`src/lib/companyTimeZone.tsx` la carga y la aplica) y etiquetas de resultados. Es puro y tiene pruebas.
- `src/lib/runner.tsx`: ejecuta corridas desde cualquier pantalla. Pide confirmación antes de escribir, muestra el progreso y abre el detalle al terminar.
- **Todas las tablas se paginan en el servidor** (clientes, historial de corridas, filas de una corrida, facturas e historial del expediente): solo viaja la página visible, y la búsqueda, los filtros y el orden los resuelve el backend. `usePage` (en `src/lib/useResource.ts`) vuelve a la página 1 en cuanto cambia un criterio, sin pedir antes una página que ya no corresponde.
- `src/components/ui.tsx`: piezas comunes (incluye `Pagination`) (tarjetas, métricas, vacíos que explican qué hacer, errores con cómo seguir, diálogo de confirmación).

El panel no tiene inicio de sesión (el enunciado no lo pide). Las credenciales del proveedor se cargan en Configuración → Proveedor. El backend nunca devuelve la contraseña: el formulario solo la envía cuando se cambia. Mientras no haya proveedor, el Resumen y Sincronización llevan a Configuración.
