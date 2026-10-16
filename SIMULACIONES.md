# Simulaciones para probar a mano

Guion paso a paso para reproducir en el panel los criterios de aceptación (§5 del enunciado) y otros casos, registrando pagos y anulaciones en la caja del ISP.

Todo se ejecutó contra la API del administrador en **http://127.0.0.1:4310** (fecha de la prueba **2026-10-13**), con un Cobrix vacío. Los resultados que aparecen aquí son los que dio esa corrida. Al terminar, la API quedó reiniciada.

> Los números de factura del ISP (`id_factura`) dependen del orden en que hagas los pagos. Si sigues el guion en orden después de reiniciar, coinciden con los de abajo.

## Herramientas

- **Caja del ISP**: Swagger en http://127.0.0.1:4310/docs, sección «Simulador». También vale `curl`; los comandos de abajo se pueden copiar tal cual.
- **Cobrix**: el panel en http://localhost:5173. Las acciones están en **Sincronización** (Importar, Actualizar pagadas y sus «Simular»), y para revisar están **Clientes** → expediente y **Resumen**.

## 0. Preparación (desde cero)

1. **Reiniciar la API** para que todas las cuotas vuelvan a su estado inicial:
   ```bash
   curl -s -X POST http://127.0.0.1:4310/__sim/reiniciar
   ```
   Respuesta: `{"period":"2026-10","holders":26,"contracts":27,"installments":210}`

2. **Vaciar Cobrix.** Detén el backend, borra su base y vuelve a levantarlo (las migraciones se aplican solas al arrancar):
   ```bash
   cd backend
   rm prisma/data/cobrix.sqlite
   npm run start:dev
   ```
   Revisa que `backend/.env` tenga `BUSINESS_DATE=2026-10-13`.

3. **Configurar el proveedor:** en el panel, Configuración → Proveedor:
   - URL `http://127.0.0.1:4310/api/v1`, usuario `cobrix`, contraseña `cobrix-sandbox`.
   - Pulsa **Probar conexión**. Debe decir: *«Conexión correcta como cobrix: el administrador tiene 27 contratos.»*
   - Pulsa **Guardar proveedor**.

Para ver el estado de la caja cuando quieras: `curl -s http://127.0.0.1:4310/__sim/contratos` (o `GET /__sim/contratos` en Swagger).

## 1. Importación

| Paso | Acción en Cobrix | Resultado esperado |
| --- | --- | --- |
| 1.1 | Sincronización → **Simular importación** | «42 facturas se importarían por USD 1.235,00». Resultados: Importada 42 · Excluida por estado 9 · Moneda incoherente 2 · Saldo residual 1. El Resumen sigue en 0: la simulación no escribe |
| 1.2 | **Importar** → confirmar | «42 facturas importadas por USD 1.235,00». Resumen: **20 clientes, 21 contratos, 42 abiertas, USD 1.235,00** |
| 1.3 | **Importar** otra vez | «0 facturas importadas». Resultados: Ya importada 42 |

En **Clientes** revisa:
- **LUIS GOMEZ**: 1 cliente con 2 contratos.
- **ELENA RUIZ**: documento `9000123`.
- Buscar `V-12345678` encuentra a ANA PEREZ.
- No deben aparecer CARLOS ROJAS (cortesía), ROSA DIAZ (retirado), PEDRO LEON (rechazado), ANDRES VARGAS (anulado), LAURA MENDEZ (sin deuda) ni JORGE CASTILLO (moneda incoherente).

## 2. Pagos de los criterios de aceptación

Registra estos pagos en la caja, **en este orden**:

### A1. ANA PEREZ paga toda su deuda (contrato 900101)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900101}'
```
Respuesta: factura **8800118**. Paga las cuotas 7000008 (2026-08, 20), 7000009 (2026-09, 25) y 7000010 (2026-10, 25).

### A2. LUIS GOMEZ, contrato cortado, abona 25 (contrato 900103, cuotas de 20)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900103, "monto": 25}'
```
Respuesta: factura **8800119**. Paga completa la 7000031 (2026-07, 20) y abona 5 a la 7000032 (2026-08).

### A3. COMERCIAL EL FARO paga todo (contrato 900104)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900104}'
```
Respuesta: factura **8800120**. Paga las cuotas 7000040 (2026-09, 60) y 7000041 (2026-10, 60).

### A4. MIGUEL ANGEL SOTO paga 70 (contrato 900114, cuotas de 35)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900114, "monto": 70}'
```
Respuesta: factura **8800121**. Paga las dos más viejas: 7000088 (2026-03) y 7000089 (2026-04).

### A5. ELENA RUIZ paga todo y luego se anula (contrato 900113)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900113}'
curl -s -X POST http://127.0.0.1:4310/__sim/anular -H 'content-type: application/json' -d '{"id_factura": 8800122}'
```
Respuestas: el pago da la factura **8800122** (cuotas 7000083 y 7000084). La anulación responde `"ANULACION EXITOSA FACTURA:008800122"`.

### Actualizar pagadas

| Paso | Acción en Cobrix | Resultado esperado |
| --- | --- | --- |
| 2.1 | **Simular actualización** | «8 facturas se marcarían pagadas · 1 abono parcial». Marcada pagada 8 · Abono parcial 1 · Sigue abierta 33. El Resumen no cambia |
| 2.2 | **Actualizar pagadas** → confirmar | «8 facturas marcadas pagadas · 1 abono parcial». Resumen: **8 pagadas, 34 abiertas, USD 955,00** |
| 2.3 | **Actualizar pagadas** otra vez | «0 facturas marcadas pagadas». Los totales no cambian |

En los expedientes revisa:

| Cliente | Documento | Esperado |
| --- | --- | --- |
| ANA PEREZ | V12345678 | Sus 3 facturas **pagadas**, fecha 13 oct. 2026, factura ISP 008800118. En el historial: «Factura pagada en el ISP» |
| LUIS GOMEZ | V9876543 | Contrato 900103: 7000031 **pagada** (008800119). 7000032 **abierta con abono parcial**: saldo USD 20,00 y «ISP: USD 15,00». 7000033 y 7000034 abiertas |
| COMERCIAL EL FARO | J401234567 | Sus 2 facturas **pagadas** (008800120) |
| MIGUEL ANGEL SOTO | V23999000 | 2026-03 y 2026-04 **pagadas** (008800121); las otras 6 abiertas |
| ELENA RUIZ | 9000123 | Las 2 siguen **abiertas**: el cobro anulado devolvió la deuda |

En el Resumen, «Atención» muestra «1 abono(s) parcial(es) en el ISP», con LUIS GOMEZ y «queda USD 15,00 de USD 20,00».

## 3. Escenarios extra

Se hacen después de la sección 2, sin reiniciar.

### B1. LUIS completa el abono pendiente (paga los 15 que faltaban)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900103, "monto": 15}'
```
Respuesta: factura **8800123**, abona 15 a la 7000032. Después de actualizar pagadas, esa factura pasa de abono parcial a **pagada** (008800123).

### B2. MARIA SILVA paga la cuota del mes en curso (contrato 900105)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900105}'
```
Respuesta: factura **8800124** (cuota 7000050, 2026-10). Después de actualizar, queda **pagada**. Sirve para ver que la cuota del mes se reconoce en cuanto existe el cobro.

### B3. VALENTINA PAZ paga solo una cuota concreta (contrato 900115)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900115, "id_cuotas": [7000100]}'
```
Respuesta: factura **8800125**, paga solo la 7000100 (2026-10). Después de actualizar, la de octubre queda **pagada** y la de septiembre (7000099) sigue **abierta**.

### B4. RAFAEL PEREZ abona 10 (contrato 900119, cuotas de 35)
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/pagar -H 'content-type: application/json' -d '{"id_contrato": 900119, "monto": 10}'
```
Respuesta: factura **8800126**, abona 10 a la más vieja (7000134, 2026-08). Después de actualizar, queda **abierta con abono parcial**: «ISP: USD 25,00».

**Actualizar pagadas** tras B1 a B4: «3 facturas marcadas pagadas · 1 abono parcial». Resumen: **11 pagadas, 31 abiertas, USD 885,00**.

### B5. Anular un pago que Cobrix ya marcó como pagado
```bash
curl -s -X POST http://127.0.0.1:4310/__sim/anular -H 'content-type: application/json' -d '{"id_factura": 8800118}'
```
Después de actualizar pagadas, las 3 facturas de ANA **siguen pagadas en Cobrix**. La actualización solo revisa facturas abiertas: no reabre las que ya marcó, aunque el ISP anule el cobro después. Es una limitación conocida y está anotada en `NOTA_DECISIONES.md`.

### Importar después de los pagos
**Importar** otra vez da «0 facturas importadas» (Ya importada 34). Las cuotas pagadas ya no aparecen como pendientes en el administrador, y nada se duplica.

## 4. Errores de la caja (para ver cómo responde)

| Caso | Comando | Respuesta |
| --- | --- | --- |
| Pagar un contrato sin deuda (LAURA MENDEZ) | `-d '{"id_contrato": 900109}'` a `/__sim/pagar` | 400 `No hay cuotas pendientes que pagar` |
| Anular dos veces la misma factura | `-d '{"id_factura": 8800122}'` a `/__sim/anular` | 400 `No se encontro el deposito con id: 8800122, o ya ingreso la solicitud de anulacion` |
| Contrato inexistente | `-d '{"id_contrato": 999999}'` a `/__sim/pagar` | 400 `Contrato no encontrado` |

## 5. Errores del lado de Cobrix

| Caso | Cómo provocarlo | Qué ves |
| --- | --- | --- |
| Credenciales malas | Configuración → Proveedor, contraseña `mala`, **Probar conexión** | «El administrador rechazó las credenciales: Contraseña Incorrecta. Corrige usuario y contraseña en Configuración.» No se guarda nada |
| Administrador caído | Detén la API (Ctrl+C en `api/`) y pulsa **Importar** | La corrida queda **Falló** en el historial, con «El administrador en http://127.0.0.1:4310/api/v1 no está disponible…». En Resumen → Atención: «La última corrida falló» |
| Sin proveedor configurado | Base de Cobrix vacía y **Importar** sin configurar el proveedor | Los botones aparecen desactivados y el panel pide «Conecta el administrador de facturas» |

## 6. Volver a empezar

```bash
curl -s -X POST http://127.0.0.1:4310/__sim/reiniciar   # API como al principio
cd backend && rm prisma/data/cobrix.sqlite                # Cobrix vacío (con el backend detenido)
```
