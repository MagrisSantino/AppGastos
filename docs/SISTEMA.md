# Control de Gastos — Mapa del sistema

> Documento de contexto. Leer una vez antes de trabajar. Es la fuente de verdad
> sobre QUÉ es el sistema, CÓMO funciona, DÓNDE está cada cosa y QUÉ NO romper.
> Si algo del código contradice este doc, gana el código (y hay que actualizar esto).

---

## 1. Qué es y para qué sirve

App **personal de finanzas** (un solo usuario, sin login). Sirve para llevar el
control del dinero propio en tres frentes, que se resumen en un **dashboard**:

- **Control semanal**: una vez por semana (corte los lunes) anotás cuánta plata
  tenés en efectivo y en el banco. El sistema calcula solo cuánto gastaste esa
  semana comparando con el corte anterior (sumando los ingresos que entraron en
  el medio). También registrás los ingresos de la semana (sueldo, extras).
- **Gestión de cuotas**: cargás compras financiadas en cuotas fijas y a qué
  tarjeta van. El sistema te dice qué pagar cada mes por tarjeta, marcás lo
  pagado, y proyecta la carga de los próximos meses. Soporta cuotas en pesos y
  en dólares (convierte con el dólar blue).
- **Metas de ahorro**: definís un objetivo de ahorro, tu sueldo, una fecha de
  inicio y una fecha objetivo. El dashboard calcula cuánto podés gastar por
  semana para llegar a la meta, con **arrastre** (lo que no gastaste una semana
  se suma a la siguiente; si te pasaste, se descuenta).

No hay multiusuario, ni roles, ni autenticación. Los datos viven en **Supabase**
(Postgres) y se sincronizan solos; si Supabase falla, hay fallback a lo que haya
en `localStorage` de ese navegador.

---

## 2. Stack y dónde corre

| Capa | Tecnología |
|------|-----------|
| Framework | **Next.js 16** (App Router), **React 19**, **TypeScript** |
| Estilos | **Tailwind CSS v4** (`@tailwindcss/postcss`) + **shadcn/ui** (Radix) |
| Estado | **Zustand** (un único store: `use-expense-store`) |
| Persistencia | **Supabase** (`@supabase/supabase-js`, key anónima) + `localStorage` legado |
| Gráficos | **Recharts** |
| Fechas | **date-fns** (semana empieza el lunes, `weekStartsOn: 1`) |
| Iconos | **lucide-react** |
| Deploy | **Vercel** (push a `main` despliega) |

**Variables de entorno** (`.env.local`, fuera del repo):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Sin esas dos, `getSupabase()` lanza error (`src/lib/supabase.ts`).

**Moneda**: todos los montos se guardan en **unidad mínima (centavos)** como
enteros. El formato de pantalla usa `Intl` con `es-CL`/`CLP` (símbolo de peso,
sin decimales). Las cuotas pueden ser `CLP` (pesos) o `USD`; los dólares se
convierten a pesos con `tipoCambioPesosPorUsd` (default `1450`), editable a mano
o traído del **dólar blue argentino** (Bluelytics) vía `/api/dolar-blue`.

---

## 3. Estructura de carpetas

```
control-gastos/
├─ CLAUDE.md                       # protocolo de tokens + puntero a este doc
├─ docs/SISTEMA.md                 # ESTE archivo
├─ src/
│  ├─ app/                         # rutas (App Router)
│  │  ├─ layout.tsx                # root: fuentes, metadata, monta <AppShell>
│  │  ├─ page.tsx                  # ruta "/" → renderiza <DashboardView>
│  │  ├─ dashboard-view.tsx        # ★ dashboard: KPIs + gráficos (pantalla pesada)
│  │  ├─ manifest.ts               # PWA manifest
│  │  ├─ api/dolar-blue/route.ts   # proxy a Bluelytics (dólar blue, cache 5 min)
│  │  ├─ control-semanal/
│  │  │  ├─ page.tsx
│  │  │  └─ control-semanal-view.tsx   # cortes semanales + ingresos de la semana
│  │  ├─ gestion-cuotas/
│  │  │  ├─ page.tsx
│  │  │  └─ gestion-cuotas-view.tsx    # compras en cuotas, tarjetas, pagos, dólar
│  │  └─ ahorros/
│  │     ├─ page.tsx
│  │     └─ ahorros-view.tsx           # config de metas de ahorro
│  ├─ components/
│  │  ├─ layout/app-shell.tsx      # sidebar (desktop) + nav inferior (móvil) + init store
│  │  ├─ loading-data.tsx
│  │  └─ ui/                       # shadcn: button, card, dialog, input, sheet, table, tabs
│  ├─ stores/
│  │  └─ use-expense-store.ts      # ★ TODO el estado y las mutaciones (zustand)
│  ├─ lib/
│  │  ├─ supabase.ts               # cliente singleton
│  │  ├─ supabase-sync.ts          # fetch/upsert/delete + mappers row<->tipo + migración
│  │  ├─ weekly-records.ts         # recálculo de gasto semanal (derivado)
│  │  ├─ ahorro-projection.ts      # ★ cálculo del presupuesto con arrastre
│  │  ├─ installments.ts           # cuotas: montos por mes, estado, normalización
│  │  ├─ cuotas-tarjeta-pagos.ts   # claves de "pagado" por tarjeta/mes/moneda
│  │  ├─ money.ts                  # parse/format de montos (centavos)
│  │  └─ utils.ts                  # cn() (clsx + tailwind-merge)
│  └─ types/
│     ├─ expenses.ts               # WeeklyExpenseRecord, IngresoSemanal, InstallmentPurchase, TarjetaCredito, MonedaCuota
│     └─ ahorro.ts                 # AhorroMetasConfig, CambioSueldo + normalizadores
└─ package.json
```

---

## 4. Modelo de datos (Supabase / Postgres)

Tablas en `snake_case` (los mappers en `supabase-sync.ts` traducen a/desde los
tipos `camelCase` de la app). Una sola fila de datos por usuario — no hay
`user_id` ni RLS por usuario (ver §8).

- **`weekly_records`** — un corte por lunes. `unique(fecha_iso)`.
  `id`, `fecha_iso` (yyyy-MM-dd, lunes), `efectivo_minor_units`,
  `transferencia_minor_units`, `ingreso_extra_minor_units` (legado, ver §5),
  `total_minor_units` (denormalizado), `gasto_semanal_minor_units` (**derivado**),
  `nota`, `creado_en`.
- **`ingresos_semanales`** — ingresos sueltos (sueldo, extras) con fecha.
  `id`, `fecha_iso`, `monto_minor_units`, `nota`, `creado_en`.
  (Tabla nueva: si no existe aún, el código la trata como vacía — error PG `42P01`.)
- **`installment_purchases`** — compras en cuotas fijas.
  `id`, `descripcion`, `total_minor_units`, `numero_cuotas`,
  `cuota_minor_units` (= round(total/cuotas)), `inicio_mes_iso` (yyyy-MM),
  `tarjeta_id` (FK lógica a `tarjetas`, o null), `moneda` ('CLP'|'USD'), `creado_en`.
- **`tarjetas`** — tarjetas de crédito del usuario. `id`, `nombre`, `creado_en`.
- **`cuotas_pagadas_keys`** — marca de "mes pagado". `key` (PK), formato
  `"<yyyy-MM>::<tarjetaId|none>::<CLP|USD>"` (ver `pagoTarjetaMesKey`).
- **`settings`** — clave/valor. `key` (PK), `value` (texto). Claves usadas:
  - `tipoCambioPesosPorUsd` → número (string).
  - `ahorroMetas` → JSON de `AhorroMetasConfig`.

**`localStorage` (legado)**: la versión vieja guardaba todo en
`control-gastos:store-v2` (Zustand persist). Al iniciar, si hay datos locales y
Supabase está vacío, se **migran** (push) a Supabase y se hace backup en
`...-v2.bak`. Es transición de una sola vez; no agregar features sobre esto.

---

## 5. Conceptos centrales del negocio

### 5.1 Gasto semanal (derivado, NO se ingresa a mano)

`recomputeWeeklyRecords(records, ingresos)` (`lib/weekly-records.ts`) ordena los
cortes por fecha y calcula, para cada semana entre el corte `i-1` y el `i`:

```
gasto = total[i-1] + (ingresos con fecha en [fecha[i-1], fecha[i])) - total[i]
```

donde `total = efectivo + transferencia`. El primer corte no tiene gasto (null).
Se conserva compatibilidad con el campo legado `ingresoExtraMinorUnits` (se suma
si está presente; se limpia al re-guardar ese corte).

**Regla dura:** cada vez que cambian `weeklyRecords` o `ingresosSemanales` hay
que volver a pasar por `recomputeWeeklyRecords`. El store ya lo hace en todos sus
setters — no escribir `gastoSemanalMinorUnits` a mano.

### 5.2 Cuotas

Una compra (`InstallmentPurchase`) genera `numeroCuotas` cuotas de
`cuotaMinorUnits` desde `inicioMesISO`, una por mes. Helpers en
`lib/installments.ts`: `sumaCuotasEnMesPorMoneda`, `resumenPagosPorTarjetaEnMes`,
`proyeccionSeisMeses`, `estadoCompra` (Activa/Finalizada), etc. Los pesos y los
dólares **nunca se mezclan** en una misma suma; recién en el dashboard se
convierte USD→pesos con el tipo de cambio para totales/gráficos comparables.

El "pagado" es por **(mes, tarjeta, moneda)**, no por cuota individual: marcar un
mes da por pagadas todas las cuotas de esa tarjeta y moneda en ese mes
(`cuotas-tarjeta-pagos.ts`).

### 5.3 Presupuesto con arrastre (metas de ahorro)

`computeAhorroProjection(...)` (`lib/ahorro-projection.ts`) es el corazón de la
sección de ahorro. Dado meta, sueldo, fecha de inicio y fecha objetivo:

1. **Cuenta los sueldos** que entran durante el plan: meses cuyo día 1 cae
   después del inicio y hasta la fecha objetivo. Con `cambiosSueldo`, cada cambio
   pisa el sueldo desde su mes.
2. **Disponible** = `Σ sueldos − metaAhorro`.
3. **Semanas del plan** = semanas calendario entre el lunes del inicio y el lunes
   del objetivo (si el objetivo no cae lunes, suma la semana parcial).
4. **Presupuesto base semanal** = disponible / semanas.
5. **Arrastre** = `base × semanasPasadas − gastosAcumulados` (gasto real
   registrado en control semanal dentro del período).
6. **Podés gastar esta semana** = `base + arrastre`.

`gastosAcumulados` sale de los `gastoSemanalMinorUnits` de los cortes dentro del
plan ⇒ **el control semanal alimenta la proyección de ahorro**. La "fecha de hoy"
puede avanzar si el último corte cargado es futuro (modo simulación en tests).

---

## 6. Flujos y pantallas

- **Arranque** (`AppShell` monta y llama `store._init()` una vez):
  `fetchAllData()` desde Supabase → si hay datos locales sin migrar, se suben →
  set del estado. Si Supabase falla, se muestra el banner de error y se cae a
  `localStorage`. Botón "Reintentar subir a Supabase" → `retrySyncToCloud()`.
- **`/` Dashboard** (`dashboard-view.tsx`): KPIs de control semanal (disponible,
  gasto última semana, promedios), tarjeta de **presupuesto con arrastre**, KPIs
  de cuotas (a pagar este/próximo mes, deuda restante, mes libre), y gráficos
  (gasto semanal, patrimonio, media móvil, proyección 12 meses, pie por tarjeta).
- **`/control-semanal`**: form para registrar/editar el corte de un lunes
  (efectivo, banco, nota) + lista de **ingresos de la semana** + historial +
  gráfico de evolución. Guardar = `saveWeeklySnapshot` / `addIngreso`.
- **`/gestion-cuotas`**: alta/edición de compras en cuotas, alta/baja de
  tarjetas, asignar tarjeta a compra, marcar pagos por tarjeta/mes, y el ajuste
  del tipo de cambio (manual o "Dólar blue (Bluelytics)").
- **`/ahorros`**: form de `AhorroMetasConfig` (sueldo, meta, fecha inicio, fecha
  objetivo, lista de cambios de sueldo). Guardar = `setAhorroMetas`.

Navegación: `app-shell.tsx` — sidebar fijo en desktop, barra inferior en móvil.

---

## 7. Persistencia y sincronización (cómo escribe el store)

- El store es la **única** fuente de verdad en runtime. Cada mutación:
  1. actualiza el estado en memoria (y re-deriva lo que corresponda), y
  2. dispara un write a Supabase **fire-and-forget** (los helpers de
     `supabase-sync.ts` loguean el error, no lo lanzan).
- `weekly_records` hace upsert con `onConflict: "fecha_iso"` (un corte por lunes,
  aunque el `id` local difiera del de la nube).
- El resto upserta por `id` (o `key`). Borrados van por `id`/`key`.
- No hay optimistic-locking ni colas: con un solo usuario alcanza. Si agregás
  escrituras, seguí el patrón (mutá estado → upsert async tolerante a fallos).

---

## 8. Puntos sensibles

1. **Sin auth y key anónima en el front:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` viaja
   al navegador (es público por diseño en Supabase). La seguridad depende de las
   **políticas RLS** del proyecto Supabase. Al ser app personal de un solo
   usuario, los datos son efectivamente accesibles a quien tenga la URL/anon key.
   No meter datos sensibles de terceros. Si alguna vez se hace multiusuario, hay
   que rediseñar tablas (con `user_id`) y RLS.
2. **Montos en centavos:** todo entero, todo en unidad mínima. Convertir a/desde
   string SOLO en los bordes (`money.ts`). Nunca guardar floats ni mezclar
   unidades. Mezclar pesos con dólares sin pasar por el tipo de cambio rompe los
   totales.
3. **Campos derivados:** `gasto_semanal_minor_units` y `total_minor_units` se
   recalculan; no son input. Editarlos a mano genera inconsistencias.
4. **Dólar blue:** `/api/dolar-blue` depende de un tercero (Bluelytics). Si falla,
   la UI cae al valor manual. No bloquear nada si ese fetch falla.
5. **Migración localStorage:** ese código corre una sola vez por navegador y toca
   `localStorage`. Tener cuidado con SSR (`typeof window === "undefined"`).

---

## 9. Reglas para trabajar en este repo (NO romper)

- **Centavos enteros** en todos los montos. Parse/format solo en los bordes.
- **No escribir campos derivados** (`gastoSemanal`, `total`): pasar siempre por
  `recomputeWeeklyRecords`.
- **Un corte por lunes** (`fecha_iso` único). Respetar `onConflict: "fecha_iso"`.
- **Writes tolerantes a fallos:** mutar estado primero, sincronizar después; no
  romper la UI si Supabase no responde.
- **No mezclar CLP y USD** en sumas; convertir solo para mostrar.
- **Semana = lunes** (`weekStartsOn: 1`) en todo cálculo de fechas.
- **Deploy:** push a `main` ⇒ Vercel. Verificar build antes de pushear
  (`npm run build` y/o `npx tsc --noEmit`).
- **Co-author** en commits: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## 10. Verificación rápida (antes de dar algo por hecho)

- Compila TS: `npx tsc --noEmit`.
- Build de Next: `npm run build`.
- Lint: `npm run lint`.
- Si tocaste cálculos (gasto semanal, cuotas, proyección de ahorro): revisar con
  números a mano que las sumas y el arrastre den bien.
- Nada que dependa de `.env.local` se rompió (las dos vars de Supabase).
```