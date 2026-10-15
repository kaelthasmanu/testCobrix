# Backend Cobrix

NestJS, TypeScript, Prisma y SQLite. Es la fuente de verdad de Cobrix: clientes, contratos, facturas, eventos del expediente y corridas, con una fila por cuota. Solo habla con el administrador de facturas por HTTP.

## Cómo está organizado

```text
src/
├── common/rules.ts            Reglas puras: identificación, periodo, ventana, moneda, fecha de negocio
├── sync/
│   ├── import-rules.ts        classifyContract() y applyRunCaps(): qué se importa y por qué (puro)
│   ├── payment-rules.ts       evaluatePayment(): qué está pagado según el libro (puro)
│   ├── sync.service.ts        Orquesta las corridas, persiste, guarda el historial, bloqueo y progreso
│   └── sync.controller.ts     POST /sync/import, POST /sync/payments, GET /sync/runs, /sync/current
├── provider/provider.client.ts  Cliente HTTP del administrador: token, re-login ante 401, reintentos, paginación
├── settings/                  Configuración (empresa, reglas, horario) y proveedor (URL y credenciales)
├── clients/                   Tabla de clientes y expediente
├── summary/                   Totales, antigüedad de la deuda y alertas
├── scheduler/                 Corrida automática diaria, en la zona horaria de la empresa
└── health/                    GET /health
prisma/
├── schema.prisma
└── migrations/                Se aplican con `npm run setup` o `prisma migrate deploy`
test/
├── rules.test.ts              Reglas de la sección 4, sin red ni base
└── full-cycle.test.ts         Criterios de la sección 5 de punta a punta contra la API entregada
```

Las reglas son funciones puras: reciben las filas de la API y devuelven un resultado con su motivo. El servicio solo pide los datos, aplica las reglas y guarda. Así cada regla se prueba sin red ni base, y la simulación ejecuta exactamente el mismo código que la corrida real, con la diferencia de que no escribe.

## Comandos

```bash
cp .env.example .env
npm install
npm run setup        # prisma generate + migrate deploy
npm run start:dev    # http://127.0.0.1:4320, Swagger en /docs
npm test             # build + todas las pruebas (necesita ../api)
npm run test:unit    # solo las reglas, sin levantar nada
npm run typecheck
```

| Variable | Para qué |
| --- | --- |
| `ADMIN_API_URL` | URL por defecto del administrador. La que se guarde en Configuración tiene prioridad. |
| `BUSINESS_DATE` | Fecha de negocio fija (`2026-10-13` en la prueba). Vacía = hoy en la zona horaria de la empresa (Configuración → Empresa, por defecto America/Caracas). |
| `ENCRYPTION_KEY` | Clave con la que se cifra (AES-256-GCM) la contraseña del proveedor. Si cambia, hay que volver a guardar la contraseña. |
| `DATABASE_URL` | SQLite de Cobrix. Las rutas relativas se resuelven desde `prisma/`. |
| `ADMIN_API_TIMEOUT_MS` | Tiempo máximo por petición al administrador. |

## Rutas paginadas

Todas las listas aceptan `?page=1&pageSize=20` (máximo 100) y responden `{ items, total, page, pageSize, pageCount }`.

| Ruta | Filtros y orden |
| --- | --- |
| `GET /clients` | `search` (nombre o documento con o sin guiones), `type=natural\|juridica`, `debt=with\|without`, `sort=name\|document\|contracts\|openInvoices\|paidInvoices\|debt\|oldestDueDate`, `order=asc\|desc` |
| `GET /clients/:documento/invoices` | `status=open\|paid` |
| `GET /clients/:documento/events` | — |
| `GET /sync/runs` | `type=import\|payments` |
| `GET /sync/runs/:id/items` | `result`, `search` (cliente, documento, cuota o contrato) |

`GET /sync/runs/:id` devuelve la cabecera de la corrida con sus contadores y `resultCounts` (filas por resultado), sin las filas.

## Resultados posibles por cuota

| Corrida | Resultado | Significa |
| --- | --- | --- |
| Importación | `imported` / `already_imported` | Factura creada / ya existía (idempotencia por `deuda_id`) |
| | `excluded_status` | Contrato con un estado conocido pero no importable |
| | `unknown_status` | Estado que la API no documenta: el contrato queda fuera |
| | `contradictory_response` | Filas de otro contrato, cuotas duplicadas, fila «sin deuda» mezclada con cuotas, datos del titular distintos entre filas |
| | `incoherent_currency` | No es USD, o es «USD» con cuotas por debajo del 1 % del precio del plan |
| | `invalid_customer` / `excluded_document` | Identificación inválida / tipo de documento excluido |
| | `zero_balance` | Saldo residual (deuda menor que un centavo) |
| | `unparseable_period` / `outside_window` | No se pudo leer el periodo / periodo fuera de la ventana |
| | `recent_limit` / `capped` | Supera el máximo de cuotas recientes / frenada por un tope de la corrida |
| Pagadas | `paid` | Todas las filas de la cuota coinciden, saldo 0 y algo pagado. Se guarda la factura del ISP que la pagó y su fecha |
| | `partial_payment` | El saldo en el ISP es menor que el de Cobrix: se informa y sigue abierta |
| | `still_open` | Sin cobros nuevos (incluye un cobro anulado, que devuelve la deuda) |
| | `exonerated` | Saldo 0 sin nada pagado: no es un pago |
| | `inconsistent_ledger` | Las filas del libro no coinciden o asignan la cuota a otro contrato |
| | `no_evidence` | La cuota no aparece en el libro ni como pendiente: nunca se marca pagada |
| Ambas | `provider_error` | El administrador falló en ese contrato tras los reintentos; el resto de la corrida sigue |

## Rarezas de la API y cómo se manejan

- **Filtro `estado` en `lista_ids_contratos`**: con cualquier valor la API devuelve solo los activos, así que nunca se envía. Igual se recorren todas las páginas que anuncie `pagination`.
- **`contrato/individual`**: devuelve una lista sin envoltorio y sin orden. Se ordena por periodo y se valida la lista completa antes de usar una sola fila.
- **`pago_informacion`**: viene con `success: false` aunque traiga datos, así que se mira `data`. Se pide hasta la fecha de negocio y además se ignoran las filas fechadas en el futuro, que corresponden a cuotas futuras o del mes en curso. Si una cuota no aparece en el libro, se consulta `contrato/individual`.
- **Token**: dura 2 horas, no tiene renovación y su vencimiento viene en UTC sin zona. Se renueva antes de vencer y, ante un 401, se vuelve a iniciar sesión una vez.
- **Errores transitorios** (red, tiempo agotado, 5xx): 2 reintentos con espera. Los mensajes de error del administrador (`detail.mensaje`) llegan al operador.
