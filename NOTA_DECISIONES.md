# Nota de decisiones

## Stack

- **Backend: NestJS, Prisma y SQLite.** Cobrix necesita su propia base: el enunciado pide que guarde clientes, facturas e historial y que solo hable con el administrador por HTTP. SQLite no necesita servidor, así que la prueba se levanta con un comando. Prisma da migraciones versionadas y Nest por su robustez , escabilidad,ademas de la inyección de dependencias, validación de DTOs, Swagger y `@nestjs/schedule` para la corrida diaria.
- **Panel: React, Vite y Tailwind.** Por su popularidad y rendimiento asi como todo el entorno y su agradable experiencia de desarrollo.
- **Docker Compose** Por su facilidad de despliegue en cualquier entorno levantando la API entregada, el backend y el panel con un solo comando `docker compose up -d`.

## Decisiones

1. **Las reglas son funciones puras y la simulación usa el mismo código.** `classifyContract`, `applyRunCaps` y `evaluatePayment` reciben las filas tal como vienen de la API y devuelven un resultado con su motivo. El servicio solo pide los datos, aplica las reglas y guarda. Por eso «Simular» no puede dar un resultado distinto de la corrida real.
2. **Ante la duda, el contrato queda fuera.** Se descarta el contrato completo, con un motivo visible por cuota, cuando aparecen filas de otro contrato, `deuda_id` repetidos, la fila «sin deuda» mezclada con cuotas, estado, documento o moneda distintos entre filas, un estado no documentado, montos inválidos o un periodo ilegible. No se intenta reparar ni elegir la fila «buena».
3. **Moneda.** Un contrato que no está en USD queda fuera. También uno que dice USD pero tiene una cuota por debajo del 1 % del precio del plan; si el plan no tiene precio, no se puede verificar y también queda fuera.
4. **Pagos.** Una factura se marca pagada solo si **todas** las filas del libro para su `id_cuota` coinciden (saldo, pagado, tarifa, descuento y periodo), el saldo es 0, hay algo pagado y existe una factura de cobro vinculada. Como factura que la pagó se toma la de cobro más reciente, y como fecha de pago su `fecha_emision`.
   - **Abono parcial**: saldo en el ISP mayor que 0 y menor que el de Cobrix. Se informa y se guarda el saldo del ISP en la factura, pero **no se reduce el saldo de Cobrix**: la factura es por la cuota importada y el criterio de aceptación (USD 955,00) lo confirma.
   - **Un abono anterior a la importación no cuenta como abono nuevo.** Es el caso de ANA PEREZ, que tenía USD 5 abonados antes y de quien Cobrix importó USD 20.
   - **Anulación**: la fila de la factura anulada sigue en el libro, pero con el saldo restituido. Por eso cae como «sigue abierta», sin ningún caso especial.
   - **Cuota del mes en curso**: el libro se pide solo hasta la fecha de negocio. Si una cuota no aparece, se consulta `contrato/individual`: si sigue pendiente, sigue abierta; si no aparece en ninguna parte, queda **sin evidencia** y nunca se marca pagada.
5. **«Sigue abierta» y «sin evidencia» son resultados distintos.** Una cuota que el libro muestra sin cobro no es lo mismo que una cuota que no aparece en ningún lado. Mezclarlas escondería los casos que sí hay que revisar.
6. **Topes.** Se aplican después de la idempotencia: lo ya importado no consume tope. Se recorren los contratos en el orden de la API y, dentro de cada uno, las cuotas de la más vieja a la más nueva. Lo frenado se vuelve a intentar en la siguiente corrida.
7. **Máximo de cuotas recientes y ventana** se aplican por contrato, sobre las cuotas que pasaron las demás reglas.
8. **Zona horaria y fecha de negocio.** La zona horaria se elige en Configuración → Empresa (por defecto America/Caracas) y la usa todo el sistema: «hoy», la ventana de importación, el libro de pagos hasta hoy, la hora de la corrida automática y cómo el panel muestra fechas y horas. Las fechas se guardan en UTC y se convierten al mostrarlas; al cambiar la zona, el panel se vuelve a montar para que ninguna fecha quede en la zona vieja. `BUSINESS_DATE` (2026-10-13 en la prueba) fija «hoy» para reproducir los resultados. Las fechas de vencimiento y corte se guardan y se muestran como fechas civiles, sin zona horaria, para que no cambien de día.
9.  **Concurrencia y fallos.** Un bloqueo en la base impide dos corridas a la vez; si el proceso muere, el bloqueo caduca a los 30 minutos y al reiniciar las corridas «en curso» quedan como fallidas con una explicación. Un error del administrador en un contrato se registra como `provider_error` y la corrida sigue con los demás. Un error global (credenciales, API caída) deja la corrida como fallida y con el mensaje.
10. **Corrida automática.** El backend revisa cada minuto si toca correr. Para saber si ya corrió hoy consulta la base, no la memoria, así que un reinicio no duplica la corrida. Si el servidor estaba apagado a la hora elegida, se pone al día dentro de las dos horas siguientes, pero activarla a media tarde no dispara una corrida inesperada.

## Lo que dejé fuera

- **Autenticación del panel.** Cualquiera que llegue a la URL puede operarlo. Para una prueba local es aceptable; en producción iría detrás de un SSO o de usuarios con roles (por ejemplo, solo un supervisor ejecuta corridas reales).
- **Varios proveedores (multi-ISP).** El modelo tiene un solo proveedor (`ProviderAuth` con id 1).
- **Reabrir facturas cuando el ISP anula un cobro posterior.** La actualización de pagadas revisa solo facturas abiertas: si el ISP anula un pago después de que Cobrix marcó la factura como pagada, Cobrix no la reabre. Con más tiempo, revisaría también las pagadas recientes y registraría un evento «pago revertido» (ver `SIMULACIONES.md`, caso B5).
- **Acciones de cobro.** No se envían correos ni se generan avisos de corte, aunque el resumen ya identifica a quién habría que gestionar.
- **Pruebas de interfaz automatizadas.** El panel se revisó con un navegador real controlado por un script (escritorio y 390 px de ancho), pero ese script no forma parte del repositorio.

## Qué haría con más tiempo

1. Pruebas end-to-end del panel con Playwright dentro del CI, reutilizando el ciclo de `full-cycle.test.ts`.
2. Una política de retención del historial de corridas y paginación por cursor para tablas muy grandes.
3. Corridas en una cola (por ejemplo BullMQ) con reintento por contrato y progreso enviado al panel con SSE en lugar de consultas periódicas.
4. Avisos fuera del panel (correo o webhook) cuando una corrida automática falla o aparecen contratos con respuestas contradictorias.
5. PostgreSQL y varios proveedores por empresa.
6. Redis como capa complementaria para producción: cachear por pocos segundos el resumen y las consultas de lectura más repetidas del panel, guardar temporalmente el progreso de corridas y usar locks distribuidos si el backend escala a varias instancias. No reemplazaría SQLite/PostgreSQL ni sería la fuente de verdad del historial, clientes o facturas; cada corrida que escriba datos tendría que invalidar las claves relacionadas y el cache tendría TTL corto para evitar mostrar saldos o estados obsoletos. Para la primera versión no es imprescindible porque el panel ya pagina las consultas y la carga esperada es baja.

## Punto diferencial

**Un panel que ayuda a decidir, no solo a ver.**

- **Atención (en el Resumen).** Reúne en un solo lugar lo que el operador debería mirar hoy: la última corrida si falló, las facturas que pasaron la fecha de corte (monto y cantidad de clientes), los abonos parciales con cliente y saldo restante, los contratos que quedaron fuera por respuestas dudosas de la API («Cobrix no adivina: revisa estos contratos con el ISP») y las facturas sin evidencia clara de pago. Cada alerta enlaza al detalle.
- **Antigüedad de la deuda.** Reparte las facturas abiertas en tramos (del mes, 1-30, 31-60, 61-90 y más de 90 días) para priorizar la cobranza.
- **Progreso en vivo de cada corrida** («Leyendo cuotas pendientes · 12 de 27»), también para la corrida automática o la que se lanzó desde otra pestaña.
- **Trazabilidad completa.** Cada factura pagada guarda el número de la factura del ISP que la pagó y su fecha. Cada cuota tiene un motivo en lenguaje claro en cada corrida, y la simulación se distingue de la corrida real en todas partes.
- **Despliegue con un comando** (`docker compose up --build`) y un CI que reproduce los criterios de aceptación de punta a punta contra la API entregada.
- **Historial de corridas: exportación a PDF**
- **UI/UX** agradable y responsive facilitando el uso del panel

Aunque el enunciado solicita consultar el historial y abrir el detalle de cada corrida, añadí el botón **«Exportar PDF»** en **Sincronización → Historial de corridas** para que el operador pueda compartir o archivar el reporte sin copiar información manualmente.

- Descarga un archivo `historial-de-corridas.pdf` listo para guardar o enviar.
- El reporte sigue el mismo formato orientado a decisión de **Atención** del Resumen: abre con una lectura ejecutiva que indica si existen corridas fallidas o todavía en curso, antes de mostrar el detalle.
- Incluye tipo de corrida, fecha, modo, origen manual o automático, estado, resumen y, cuando exista, el error.
- Exporta **todas** las corridas que correspondan al filtro activo, no solamente la página visible.
- Se genera completamente en el navegador, sin depender de servicios externos ni enviar datos adicionales fuera de Cobrix.

### CI reproducible

El workflow de GitHub Actions valida los dos paquetes reales del repositorio (`backend` y `frontend`) en cada push a `main` y en cada pull request. Ejecuta typecheck, pruebas del backend, pruebas del frontend y build de producción del frontend para detectar errores antes de integrar cambios.
