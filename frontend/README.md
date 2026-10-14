# Cobrix web

Panel de Cobrix migrado a React, TypeScript, Vite y Tailwind CSS. La interfaz consume la API del administrador, pero no modifica su código ni su base de datos.

La conexión con el administrador se configura desde la pantalla `Configuración`, usando la API definida en `.env`. El token se conserva en `sessionStorage` para sobrevivir recargas en la misma pestaña, se elimina al desconectar o al expirar, y no se comparte con otras pestañas ni se conserva al cerrar la pestaña. `access_token_expires_in` se interpreta como fecha UTC sin zona horaria.

## Desarrollo

```bash
npm install
npm run dev
```

Vite inicia normalmente en `http://localhost:5173`. Para apuntar el enlace de Swagger a otra instancia de la API, define `VITE_SIMULATOR_URL` (por defecto `http://127.0.0.1:4310`).

`VITE_API_URL` define la URL base de la API (por defecto en `.env`: `http://127.0.0.1:4310/api/v1`). Durante desarrollo, Vite proxya esa ruta a la API para evitar problemas de CORS.

## Producción

```bash
npm run build
npm run preview
```

## Pruebas

```bash
npm test
npm run build
```

Las pruebas usan el runner nativo de Node y cubren:

- Normalización de identificaciones.
- Extracción de periodos y ventana de importación.
- Moneda coherente y saldos residuales.
- Pagos completos, abonos parciales y ausencia de evidencia.
- Un ciclo completo de dominio: importar cuotas, registrar pagos en una caja simulada y actualizar las facturas.

El ciclo de prueba es determinista y no requiere levantar la API. La verificación manual contra el simulador real se realiza desde Swagger con `POST /__sim/pagar` y `POST /__sim/anular`.
