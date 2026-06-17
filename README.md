# Control de Gastos

App personal de finanzas (un solo usuario, sin login) para llevar el control del
dinero propio en tres frentes, resumidos en un **dashboard** con KPIs y gráficos:

- **Control semanal** — una vez por semana (corte los lunes) anotás cuánta plata
  tenés en efectivo y en el banco; el sistema calcula solo cuánto gastaste esa
  semana comparando con el corte anterior y sumando los ingresos que entraron en
  el medio.
- **Gestión de cuotas** — cargás compras financiadas en cuotas fijas y a qué
  tarjeta van; sabés qué pagar cada mes por tarjeta, marcás lo pagado y ves la
  proyección de los próximos meses. Soporta pesos y dólares (convierte con el
  dólar blue de Bluelytics).
- **Metas de ahorro** — definís un objetivo, tu sueldo, fecha de inicio y fecha
  objetivo; el dashboard calcula cuánto podés gastar por semana para llegar a la
  meta, con **arrastre** (lo que no gastaste se suma a la semana siguiente; si te
  pasaste, se descuenta).

> 📖 Para entender cómo funciona por dentro (modelo de datos, cálculos, qué no
> romper), leé **[`docs/SISTEMA.md`](docs/SISTEMA.md)**.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui ·
Zustand · Recharts · date-fns · **Supabase** (Postgres) como persistencia.

## Puesta en marcha

Requiere un proyecto de Supabase con las tablas que describe `docs/SISTEMA.md`.
Creá un `.env.local` con:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Instalá dependencias y levantá el dev server:

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Qué hace |
|--------|----------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run lint` | ESLint |

## Datos y persistencia

Los datos se guardan en **Supabase** y se sincronizan solos. Si Supabase no
responde, la app cae al fallback de `localStorage` de ese navegador. Todos los
montos se manejan en **centavos** (enteros). Hay una migración automática, de una
sola vez, desde la versión vieja que guardaba todo en `localStorage`.

## Deploy

Desplegado en **Vercel**: cada push a `main` dispara un deploy. Configurá las dos
variables de entorno de Supabase en el proyecto de Vercel.
