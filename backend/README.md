# Backend Cobrix

Backend NestJS + TypeScript para Cobrix. Es la fuente de verdad de la aplicación:
guarda clientes, contratos, facturas, eventos y corridas en su propia base SQLite.
La API del administrador solo se consume por HTTP; este proyecto no lee
`api/data/billing-api.sqlite`.

## Arquitectura

```text
backend/
├── prisma/
│   └── schema.prisma          # Modelo SQLite y cliente Prisma
├── src/
│   ├── auth/                  # Login propio, JWT y guard de rutas
│   ├── clients/               # Tabla y expediente de clientes
│   ├── common/                # Reglas, tipos comunes y cifrado
│   ├── database/              # PrismaClient y ciclo de vida de la BD
│   ├── provider/              # Cliente HTTP del administrador ISP
│   ├── scheduler/             # Corrida diaria en America/Caracas
│   ├── settings/              # Configuración y credenciales del proveedor
│   ├── summary/               # Métricas y últimas corridas
│   └── sync/                  # Importación, pagos e historial
├── .env.example
└── package.json
```

Las interfaces y contratos compartidos del frontend viven en
`frontend/src/interfaces/`, organizados por dominio (`auth`, `config`, `sync`,
`data`, clientes y expediente). Las páginas solo presentan datos y llaman a
los endpoints del backend.

## Requisitos

- Node.js 20 o superior.
- API del administrador levantada en `http://127.0.0.1:4310`.

## Configuración

```bash
cd backend
cp .env.example .env
```

Variables principales:

```dotenv
PORT=4320
ADMIN_API_URL=http://127.0.0.1:4310/api/v1
JWT_SECRET=cambia-este-secreto
ENCRYPTION_KEY=una-clave-segura-de-32-bytes
DATABASE_URL=file:./data/cobrix.sqlite
```

`ENCRYPTION_KEY` debe ser una clave estable de 32 bytes para poder renovar el
token del proveedor. Las credenciales se guardan cifradas; la contraseña no se
envía al navegador ni se persiste en `localStorage`.

## Instalar y levantar

Desde la raíz:

```bash
npm install --prefix backend
backend/node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma
npm run build --prefix backend
npm run start:dev --prefix backend
```

El backend queda disponible en `http://127.0.0.1:4320`.

Antes de iniciar en un entorno nuevo, aplica el esquema SQLite:

```bash
backend/node_modules/.bin/prisma db push --schema backend/prisma/schema.prisma
```

Para producción:

```bash
npm run build --prefix backend
npm start --prefix backend
```

## Corrida automática

La configuración guarda `automaticRunEnabled` y `automaticRunTime`. Mientras el
proceso NestJS esté levantado, un cron revisa la hora cada minuto en la zona
`America/Caracas`. Cuando coincide:

1. Ejecuta una importación real.
2. Si termina correctamente, actualiza las facturas pagadas.
3. Registra cada etapa en el historial de corridas.
4. Evita ejecuciones duplicadas en el mismo día y corridas simultáneas.

Si el proceso está apagado a la hora configurada, no hay un proceso externo que
recupere esa ejecución automáticamente; debe mantenerse el backend ejecutándose
o añadirse un supervisor del sistema.

## Pruebas y validación

```bash
npm run build --prefix backend
npm test --prefix backend
npm run build --prefix frontend
npm test --prefix frontend
```

La API del administrador debe estar disponible para probar login y
sincronización. El backend nunca debe apuntar su `DATABASE_URL` a la base del
administrador.

## Endpoints principales

- `POST /auth/login`
- `GET/PATCH /settings`
- `POST /settings/test-connection`
- `POST /sync/import?simulation=true|false`
- `POST /sync/payments?simulation=true|false`
- `GET /sync/runs`
- `GET /sync/runs/:id`
- `GET /clients`
- `GET /clients/:document`
- `GET /summary`

Salvo `/auth/login`, los endpoints requieren
`Authorization: Bearer <token>`.
