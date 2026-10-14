# Cobrix web

Panel de Cobrix migrado a React, TypeScript, Vite y Tailwind CSS. La distribución y las pantallas conservan el contenido del panel original; sus secciones siguen siendo placeholders por implementar.

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
