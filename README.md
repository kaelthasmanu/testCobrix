# Prueba técnica Cobrix: integración con un administrador de facturas

Cobrix importa clientes y facturas desde la API del administrador de facturas de un ISP, marca pagadas las que el ISP ya cobró y ofrece un panel para operarlo.

```
 API del administrador (entregada)        Backend Cobrix (NestJS + SQLite)        Panel (React)
 api/ · :4310 · sin cambios      ◄─HTTP─  backend/ · :4320 · reglas, corridas,  ◄─  frontend/ · :5173
 /__sim/* = caja del ISP                  historial, corrida automática
```

- **`api/`**: la API simulada que se entregó. No se modificó; Cobrix solo habla con ella por HTTP.
- **`backend/`**: la fuente de verdad de Cobrix. Guarda clientes, contratos, facturas, eventos y corridas en su propia base SQLite (Prisma). Ver [`backend/README.md`](backend/README.md).
- **`frontend/`**: el panel del operador (React, Vite y Tailwind). Ver [`frontend/README.md`](frontend/README.md).

Las decisiones, lo que quedó fuera y el punto diferencial están en [`NOTA_DECISIONES.md`](NOTA_DECISIONES.md).

## Rectificaciones y mejoras aplicadas

Durante la revisión se corrigieron varios aspectos técnicos y de presentación:

- Se reemplazaron consultas SQL manuales del módulo de clientes por consultas Prisma tipadas. Además de aprovechar correctamente el ORM, esto evita interpolar filtros y reducir riesgos de inyección SQL.
- Se extrajo la lógica de clientes a un servicio, dejando los controladores enfocados en HTTP, validación y delegación.
- Se corrigieron filtros combinados, ordenamiento, paginación y tipado estricto para conservar el comportamiento esperado.
- Se ajustó el CI para generar Prisma Client antes del typecheck y validar backend y frontend con typecheck, pruebas y build.
- Se mejoró el panel con modo oscuro predeterminado, modo claro persistente y un selector accesible.
- Se rediseñó la exportación del historial a PDF con una tabla legible, paginación y un resumen de atención para destacar corridas fallidas o pendientes.

## Levantarlo con un solo comando (Docker)

Requisitos: Docker Engine 24+ con Compose v2.

```bash
docker compose up --build
```

| Qué | Dónde |
| --- | --- |
| Panel | http://localhost:5173 |
| Backend Cobrix y su Swagger | http://localhost:4320/docs |
| API del administrador y su Swagger (incluye el simulador de caja) | http://localhost:4310/docs |

El panel abre directo, sin inicio de sesión (el enunciado no lo pide). La primera vez, ve a **Configuración → Proveedor**, pon usuario `cobrix` y contraseña `cobrix-sandbox`, usa «Probar conexión» (debe decir 27 contratos) y guarda. En Docker la URL ya viene puesta (`http://admin-api:4310/api/v1`); en local es `http://127.0.0.1:4310/api/v1`.

La fecha de negocio queda fija en **2026-10-13**, la fecha de los criterios de aceptación, tanto en la API (`SANDBOX_TODAY`) como en Cobrix (`BUSINESS_DATE`). Para producción, define `ENCRYPTION_KEY` en un `.env` en la raíz; Compose la toma de ahí.

`docker compose down -v` borra las dos bases (la de Cobrix y la de la API) y deja todo como al principio.

## Levantarlo en local (sin Docker)

Requisito: Node.js 24 o superior. Se necesitan tres terminales.

```bash
# 1. API del administrador (fija la fecha 2026-10-13)
cd api && npm install && npm start

# 2. Backend de Cobrix
cd backend
cp .env.example .env          # revisa ENCRYPTION_KEY
npm install
npm run setup                 # genera el cliente Prisma y aplica las migraciones
npm run start:dev             # http://127.0.0.1:4320 (Swagger en /docs)

# 3. Panel
cd frontend
cp .env.example .env          # VITE_COBRIX_API_URL=http://127.0.0.1:4320
npm install
npm run dev                   # http://localhost:5173
```

## Pruebas

```bash
cd backend && npm test        # 29 pruebas de reglas + 12 del ciclo completo de punta a punta
cd frontend && npm test       # formatos del panel (montos, fechas, etiquetas)
cd api && npm test            # pruebas de la API entregada
```

- **`backend/test/rules.test.ts`** cubre cada regla de la sección 4 del enunciado como función pura: normalización de la identificación, persona natural o jurídica, periodo, vencimiento y corte, fila «sin deuda», saldo residual, estados, moneda incoherente, respuestas contradictorias, ventana, máximo de cuotas recientes, topes, idempotencia, pagadas, abono parcial, exonerada, anulación, cuotas futuras, sin evidencia y la cuota del mes que aún no aparece en el libro.
- **`backend/test/full-cycle.test.ts`** reproduce la sección 5 por HTTP. Levanta la API entregada con una base nueva y el backend compilado con una SQLite temporal. Después simula, importa e importa otra vez; registra los 5 pagos y la anulación en la caja (`/__sim/pagar`, `/__sim/anular`); actualiza pagadas dos veces y comprueba los números: 42 facturas por USD 1.235,00 y 20 clientes al importar, y 8 pagadas y 34 abiertas por USD 955,00 al final. También comprueba que las credenciales malas no se guardan, que la contraseña nunca se devuelve y que una corrida sin proveedor o con la API caída queda registrada como fallida y con el error.

El CI (`.github/workflows/ci.yml`) corre las tres suites, el chequeo de tipos y el build del panel.

## Recorrer los criterios de aceptación a mano

El guion completo, con cada pago y anulación en la caja, la respuesta esperada y qué revisar en el panel (más casos extra y de error), está en [`SIMULACIONES.md`](SIMULACIONES.md). Resumen:

1. Configura el proveedor (ver arriba) y ve a **Sincronización**. Usa **Simular importación**: 42 cuotas se importarían y no se crea nada.
2. Pulsa **Importar** y confirma: 20 clientes y 42 facturas por USD 1.235,00. El detalle de la corrida muestra una fila por cuota con su motivo.
3. En http://localhost:4310/docs, sección «Simulador», registra los pagos de la tabla del enunciado (`POST /__sim/pagar` y `POST /__sim/anular`).
4. Pulsa **Actualizar pagadas**: 8 pagadas, 1 abono parcial y 34 abiertas por USD 955,00. Si la repites, no cambia nada.
5. `POST /__sim/reiniciar` deja la API como al principio. Para vaciar Cobrix, borra `backend/prisma/data/cobrix.sqlite` y corre `npm run setup`, o usa `docker compose down -v`.
