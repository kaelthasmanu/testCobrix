# Prueba técnica Cobrix

Integración de un panel React con la API simulada del administrador de facturas de un ISP.

## Requisitos

- Node.js 24 o superior, o Docker Desktop.
- API del administrador disponible en `http://127.0.0.1:4310`.

## Levantar el proyecto

### API del administrador

La API entregada está en `api/` y no fue modificada por el frontend:

```bash
cd api
npm install
npm start
```

Endpoints útiles:

- API: http://127.0.0.1:4310/api/v1
- Swagger: http://127.0.0.1:4310/docs

Credenciales del entorno de prueba:

```text
Usuario: cobrix
Contraseña: cobrix-sandbox
```

### Panel React

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

El panel queda disponible normalmente en http://localhost:5173. La URL del backend
Cobrix se configura en `frontend/.env` mediante `VITE_COBRIX_API_URL`.

## Levantar todo con Docker Compose

Docker Compose levanta los tres procesos necesarios:

- `admin-api`: API simulada del administrador en http://localhost:4310.
- `backend`: API Cobrix en http://localhost:4320.
- `frontend`: panel React servido por Nginx en http://localhost:5173.

La API del administrador continúa siendo un servicio separado y no se modifica.
El backend solo la consume por HTTP usando la red interna de Compose.

### Requisitos

- Docker Engine 24 o superior.
- Docker Compose v2.

### Configuración inicial

En la raíz del proyecto:

```bash
cp backend/.env.example .env
```

Edita `.env` y define secretos reales:

```dotenv
JWT_SECRET=cambia-por-un-secreto-largo
ENCRYPTION_KEY=12345678901234567890123456789012
VITE_COBRIX_API_URL=http://localhost:4320
```

`ENCRYPTION_KEY` debe tener exactamente 32 bytes. No se deben subir secretos al
repositorio.

### Construir y levantar

```bash
docker compose up --build
```

Abre http://localhost:5173 e inicia sesión con:

```text
Usuario: cobrix
Contraseña: cobrix-sandbox
```

La base SQLite propia de Cobrix se conserva en el volumen `cobrix-data`. La base
de la API simulada se conserva en `admin-data`.

Comandos útiles:

```bash
# Ver logs
docker compose logs -f backend

# Detener servicios sin borrar datos
docker compose down

# Detener y borrar los volúmenes persistentes
docker compose down -v

# Reconstruir solo un servicio
docker compose build backend
docker compose up -d backend
```

Para cambiar la URL pública del backend durante el build:

```bash
VITE_COBRIX_API_URL=https://cobrix.example.com docker compose build frontend
```

## Pruebas

Pruebas automáticas del frontend:

```bash
cd frontend
npm test
npm run build
```

Pruebas de la API entregada:

```bash
cd api
npm test
npm run typecheck
```

Las pruebas del frontend verifican las reglas de clientes, facturas y pagos, además de un ciclo completo de importación, pago en caja y actualización de facturas pagadas. No requieren modificar ni levantar la API.

## Nota de decisiones

Consulta las decisiones, alcance y pendientes en [NOTA_DECISIONES.md](NOTA_DECISIONES.md).
