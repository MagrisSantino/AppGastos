"use client";

import * as React from "react";
import {
  addMonths,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CreditCard,
  DollarSign,
  Minus,
  TrendingDown,
  Wallet,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { compraTodaPagada } from "@/lib/cuotas-tarjeta-pagos";
import {
  estadoCompra,
  mesInicioDate,
  sumaCuotasEnMesPorMoneda,
} from "@/lib/installments";
import {
  formatCuotaMoney,
  formatMoneyMinorUnits,
} from "@/lib/money";
import { LoadingData } from "@/components/loading-data";
import { cn } from "@/lib/utils";
import { useExpenseStore } from "@/stores/use-expense-store";
import type {
  InstallmentPurchase,
  WeeklyExpenseRecord,
} from "@/types/expenses";

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */

function mesLabel(mesISO: string): string {
  return format(parseISO(`${mesISO}-01`), "MMM yy", { locale: es });
}

function mesLabelLargo(mesISO: string): string {
  return format(parseISO(`${mesISO}-01`), "MMMM yyyy", { locale: es });
}

function pct(a: number, b: number): number | null {
  if (b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

const COLORES_PIE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

/* ------------------------------------------------------------------ */
/*  WEEKLY STATS                                                      */
/* ------------------------------------------------------------------ */

function weeklyStats(records: WeeklyExpenseRecord[]) {
  const sorted = [...records].sort((a, b) =>
    a.fechaISO.localeCompare(b.fechaISO)
  );

  const conGasto = sorted.filter(
    (r): r is typeof r & { gastoSemanalMinorUnits: number } =>
      r.gastoSemanalMinorUnits != null
  );

  const ultimo = sorted.at(-1) ?? null;
  const penultimo = sorted.at(-2) ?? null;

  const ultimoGasto = conGasto.at(-1)?.gastoSemanalMinorUnits ?? null;
  const penultimoGasto =
    conGasto.length >= 2
      ? conGasto.at(-2)!.gastoSemanalMinorUnits
      : null;

  const gastosDeLast4 = conGasto.slice(-4);
  const promedioGasto4 =
    gastosDeLast4.length > 0
      ? gastosDeLast4.reduce((s, r) => s + r.gastoSemanalMinorUnits, 0) /
        gastosDeLast4.length
      : null;

  const todosGastos = conGasto.map((r) => r.gastoSemanalMinorUnits);
  const promedioHistorico =
    todosGastos.length > 0
      ? todosGastos.reduce((s, v) => s + v, 0) / todosGastos.length
      : null;

  const maxGasto =
    todosGastos.length > 0 ? Math.max(...todosGastos) : null;
  const minGasto =
    todosGastos.length > 0 ? Math.min(...todosGastos) : null;

  const totalDisponible = ultimo?.totalMinorUnits ?? null;
  const totalAnterior = penultimo?.totalMinorUnits ?? null;

  const totalEfectivo = ultimo?.efectivoMinorUnits ?? null;
  const totalTransferencia = ultimo?.transferenciaMinorUnits ?? null;

  const semanasRegistradas = records.length;

  const totalGastadoHistorico = todosGastos.reduce((s, v) => s + v, 0);

  return {
    sorted,
    conGasto,
    ultimo,
    ultimoGasto,
    penultimoGasto,
    promedioGasto4,
    promedioHistorico,
    maxGasto,
    minGasto,
    totalDisponible,
    totalAnterior,
    totalEfectivo,
    totalTransferencia,
    semanasRegistradas,
    totalGastadoHistorico,
  };
}

/* ------------------------------------------------------------------ */
/*  CUOTAS STATS                                                      */
/* ------------------------------------------------------------------ */

function cuotasStats(
  compras: InstallmentPurchase[],
  keysPagados: readonly string[],
  tipoCambio: number,
  ahora: Date
) {
  const mesEste = format(startOfMonth(ahora), "yyyy-MM");
  const mesSig = format(addMonths(startOfMonth(ahora), 1), "yyyy-MM");

  const esteMes = sumaCuotasEnMesPorMoneda(compras, mesEste);
  const sigMes = sumaCuotasEnMesPorMoneda(compras, mesSig);

  const activas = compras.filter((c) => estadoCompra(c, ahora) === "Activa");
  const pagadas = compras.filter((c) => compraTodaPagada(c, keysPagados));
  const pendientes = compras.filter(
    (c) =>
      estadoCompra(c, ahora) === "Activa" &&
      !compraTodaPagada(c, keysPagados)
  );

  const totalDeudaPendienteCLP = pendientes
    .filter((c) => c.moneda !== "USD")
    .reduce((s, c) => {
      const mesesRestantes = cuotasRestantes(c, mesEste);
      return s + c.cuotaMinorUnits * mesesRestantes;
    }, 0);

  const totalDeudaPendienteUSD = pendientes
    .filter((c) => c.moneda === "USD")
    .reduce((s, c) => {
      const mesesRestantes = cuotasRestantes(c, mesEste);
      return s + c.cuotaMinorUnits * mesesRestantes;
    }, 0);

  const proyeccion12 = Array.from({ length: 12 }, (_, i) => {
    const d = addMonths(startOfMonth(ahora), i);
    const iso = format(d, "yyyy-MM");
    const m = sumaCuotasEnMesPorMoneda(compras, iso);
    return {
      mesISO: iso,
      etiqueta: mesLabel(iso),
      clp: m.CLP / 100,
      usd: m.USD / 100,
      totalPesos: m.CLP / 100 + (m.USD / 100) * tipoCambio,
    };
  });

  const mesMasCaro = proyeccion12.reduce(
    (best, m) => (m.totalPesos > best.totalPesos ? m : best),
    proyeccion12[0]
  );

  const mesLibre = proyeccion12.find(
    (m) => m.clp === 0 && m.usd === 0
  );

  return {
    mesEste,
    mesSig,
    esteMes,
    sigMes,
    activas,
    pagadas,
    pendientes,
    totalDeudaPendienteCLP,
    totalDeudaPendienteUSD,
    proyeccion12,
    mesMasCaro,
    mesLibre,
  };
}

function cuotasRestantes(c: InstallmentPurchase, mesActualISO: string): number {
  const base = mesInicioDate(c.inicioMesISO);
  let restantes = 0;
  for (let k = 0; k < c.numeroCuotas; k++) {
    const m = format(addMonths(base, k), "yyyy-MM");
    if (m >= mesActualISO) restantes++;
  }
  return restantes;
}

/* ------------------------------------------------------------------ */
/*  KPI CARD                                                          */
/* ------------------------------------------------------------------ */

function KpiCard({
  titulo,
  valor,
  subtitulo,
  icono: Icon,
  trend,
  trendLabel,
  className,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  icono?: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral" | null;
  trendLabel?: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-border shadow-sm", className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">
              {titulo}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl">
              {valor}
            </p>
            {subtitulo ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {subtitulo}
              </p>
            ) : null}
            {trendLabel ? (
              <p
                className={cn(
                  "mt-1 flex items-center gap-1 text-xs font-medium",
                  trend === "up" && "text-rose-600",
                  trend === "down" && "text-emerald-600",
                  trend === "neutral" && "text-muted-foreground"
                )}
              >
                {trend === "up" ? (
                  <ArrowUp className="size-3" />
                ) : trend === "down" ? (
                  <ArrowDown className="size-3" />
                ) : (
                  <Minus className="size-3" />
                )}
                {trendLabel}
              </p>
            ) : null}
          </div>
          {Icon ? (
            <div className="rounded-lg bg-muted p-2">
              <Icon className="size-5 text-muted-foreground" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  MINI TOOLTIP                                                       */
/* ------------------------------------------------------------------ */

function ChartTooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN VIEW                                                         */
/* ------------------------------------------------------------------ */

export function DashboardView() {
  const isLoading = useExpenseStore((s) => s.isLoading);
  const weeklyRecords = useExpenseStore((s) => s.weeklyRecords);
  const compras = useExpenseStore((s) => s.installmentPurchases);
  const tarjetas = useExpenseStore((s) => s.tarjetas);
  const keysPagados = useExpenseStore((s) => s.cuotasTarjetaPagadasKeys);
  const tipoCambio = useExpenseStore((s) => s.tipoCambioPesosPorUsd);

  const ahora = React.useMemo(() => new Date(), []);

  const ws = React.useMemo(() => weeklyStats(weeklyRecords), [weeklyRecords]);

  const cs = React.useMemo(
    () => cuotasStats(compras, keysPagados, tipoCambio, ahora),
    [compras, keysPagados, tipoCambio, ahora]
  );

  /* ----- weekly chart data ----- */
  const gastoChartData = React.useMemo(() => {
    return ws.conGasto.slice(-12).map((r) => ({
      fecha: r.fechaISO,
      etiqueta: format(parseISO(r.fechaISO), "d MMM", { locale: es }),
      gasto: r.gastoSemanalMinorUnits / 100,
    }));
  }, [ws.conGasto]);

  const patrimonioChartData = React.useMemo(() => {
    return ws.sorted.slice(-12).map((r) => ({
      fecha: r.fechaISO,
      etiqueta: format(parseISO(r.fechaISO), "d MMM", { locale: es }),
      total: r.totalMinorUnits / 100,
      efectivo: r.efectivoMinorUnits / 100,
      transferencia: r.transferenciaMinorUnits / 100,
    }));
  }, [ws.sorted]);

  /* ----- tendencia gasto: media móvil 4 semanas ----- */
  const mediaMovilData = React.useMemo(() => {
    const datos = ws.conGasto;
    if (datos.length < 4) return [];
    const out: { etiqueta: string; media: number; gasto: number }[] = [];
    for (let i = 3; i < datos.length; i++) {
      const window4 = datos.slice(i - 3, i + 1);
      const media =
        window4.reduce((s, r) => s + r.gastoSemanalMinorUnits, 0) / 4 / 100;
      out.push({
        etiqueta: format(parseISO(datos[i].fechaISO), "d MMM", { locale: es }),
        media,
        gasto: datos[i].gastoSemanalMinorUnits / 100,
      });
    }
    return out.slice(-12);
  }, [ws.conGasto]);

  /* ----- gastos semanales vs promedio bar chart ----- */
  const gastosVsPromedioData = React.useMemo(() => {
    if (ws.promedioHistorico == null) return [];
    const avg = ws.promedioHistorico / 100;
    return ws.conGasto.slice(-8).map((r) => ({
      etiqueta: format(parseISO(r.fechaISO), "d MMM", { locale: es }),
      gasto: r.gastoSemanalMinorUnits / 100,
      promedio: avg,
    }));
  }, [ws.conGasto, ws.promedioHistorico]);

  /* ----- top 5 compras activas ----- */
  const top5Compras = React.useMemo(() => {
    return [...cs.pendientes]
      .sort((a, b) => b.cuotaMinorUnits - a.cuotaMinorUnits)
      .slice(0, 5);
  }, [cs.pendientes]);

  /* ----- proyeccion cuotas stacked bar ----- */
  const proyeccionBarData = cs.proyeccion12;

  const hayDatosWeekly = weeklyRecords.length > 0;
  const hayDatosCuotas = compras.length > 0;

  const gastoVariacion =
    ws.ultimoGasto != null && ws.penultimoGasto != null
      ? pct(ws.ultimoGasto, ws.penultimoGasto)
      : null;

  const disponibleVariacion =
    ws.totalDisponible != null && ws.totalAnterior != null
      ? pct(ws.totalDisponible, ws.totalAnterior)
      : null;

  if (isLoading) return <LoadingData />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen completo de tus finanzas personales.
        </p>
      </div>

      {/* ============================================================ */}
      {/*  KPI ROW 1 — Control semanal                                 */}
      {/* ============================================================ */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Control semanal
        </h2>
        {!hayDatosWeekly ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay registros semanales. Cargá el primer corte en{" "}
            <span className="font-medium text-foreground">Control Semanal</span>.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              titulo="Disponible ahora"
              valor={
                ws.totalDisponible != null
                  ? formatMoneyMinorUnits(ws.totalDisponible)
                  : "—"
              }
              subtitulo={
                ws.totalEfectivo != null && ws.totalTransferencia != null
                  ? `Efectivo ${formatMoneyMinorUnits(ws.totalEfectivo)} · Banco ${formatMoneyMinorUnits(ws.totalTransferencia)}`
                  : undefined
              }
              icono={Wallet}
              trend={
                disponibleVariacion != null
                  ? disponibleVariacion > 0
                    ? "down"
                    : disponibleVariacion < 0
                      ? "up"
                      : "neutral"
                  : null
              }
              trendLabel={
                disponibleVariacion != null
                  ? `${disponibleVariacion > 0 ? "+" : ""}${disponibleVariacion.toFixed(1)}% vs semana anterior`
                  : undefined
              }
            />
            <KpiCard
              titulo="Gasto última semana"
              valor={
                ws.ultimoGasto != null
                  ? formatMoneyMinorUnits(ws.ultimoGasto)
                  : "—"
              }
              icono={TrendingDown}
              trend={
                gastoVariacion != null
                  ? gastoVariacion > 5
                    ? "up"
                    : gastoVariacion < -5
                      ? "down"
                      : "neutral"
                  : null
              }
              trendLabel={
                gastoVariacion != null
                  ? `${gastoVariacion > 0 ? "+" : ""}${gastoVariacion.toFixed(1)}% vs semana anterior`
                  : undefined
              }
            />
            <KpiCard
              titulo="Promedio gasto últimas 4 sem."
              valor={
                ws.promedioGasto4 != null
                  ? formatMoneyMinorUnits(Math.round(ws.promedioGasto4))
                  : "—"
              }
              subtitulo={
                ws.promedioHistorico != null
                  ? `Histórico: ${formatMoneyMinorUnits(Math.round(ws.promedioHistorico))}`
                  : undefined
              }
              icono={BarChart3}
            />
            <KpiCard
              titulo="Semanas registradas"
              valor={String(ws.semanasRegistradas)}
              subtitulo={
                ws.totalGastadoHistorico > 0
                  ? `Total gastado: ${formatMoneyMinorUnits(ws.totalGastadoHistorico)}`
                  : undefined
              }
              icono={DollarSign}
            />
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/*  KPI ROW 2 — Cuotas                                         */}
      {/* ============================================================ */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Cuotas
        </h2>
        {!hayDatosCuotas ? (
          <p className="text-sm text-muted-foreground">
            No hay compras en cuotas cargadas. Creá la primera en{" "}
            <span className="font-medium text-foreground">
              Gestión de Cuotas
            </span>
            .
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              titulo={`A pagar ${mesLabelLargo(cs.mesEste)}`}
              valor={
                cs.esteMes.CLP > 0 || cs.esteMes.USD > 0
                  ? [
                      cs.esteMes.CLP > 0
                        ? formatCuotaMoney(cs.esteMes.CLP, "CLP")
                        : null,
                      cs.esteMes.USD > 0
                        ? formatCuotaMoney(cs.esteMes.USD, "USD")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")
                  : "Sin cuotas"
              }
              icono={CreditCard}
            />
            <KpiCard
              titulo={`Próximo: ${mesLabelLargo(cs.mesSig)}`}
              valor={
                cs.sigMes.CLP > 0 || cs.sigMes.USD > 0
                  ? [
                      cs.sigMes.CLP > 0
                        ? formatCuotaMoney(cs.sigMes.CLP, "CLP")
                        : null,
                      cs.sigMes.USD > 0
                        ? formatCuotaMoney(cs.sigMes.USD, "USD")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")
                  : "Sin cuotas"
              }
              icono={CreditCard}
            />
            <KpiCard
              titulo="Compras activas"
              valor={String(cs.pendientes.length)}
              subtitulo={`${cs.pagadas.length} pagada${cs.pagadas.length !== 1 ? "s" : ""} · ${compras.length} total`}
            />
            <KpiCard
              titulo="Deuda restante"
              valor={
                cs.totalDeudaPendienteCLP > 0 || cs.totalDeudaPendienteUSD > 0
                  ? [
                      cs.totalDeudaPendienteCLP > 0
                        ? formatCuotaMoney(cs.totalDeudaPendienteCLP, "CLP")
                        : null,
                      cs.totalDeudaPendienteUSD > 0
                        ? formatCuotaMoney(cs.totalDeudaPendienteUSD, "USD")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")
                  : "$0"
              }
              subtitulo={
                cs.mesLibre
                  ? `Libre de cuotas: ${mesLabelLargo(cs.mesLibre.mesISO)}`
                  : undefined
              }
            />
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/*  CHARTS ROW 1                                                */}
      {/* ============================================================ */}
      {hayDatosWeekly && gastoChartData.length > 1 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Gasto semanal */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Gasto semanal</CardTitle>
              <CardDescription>Últimas semanas con gasto calculado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56 w-full sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={gastoChartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={44} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={40}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("es-CL", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(v)
                      }
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <ChartTooltipBox>
                            <p className="font-medium text-foreground">{label}</p>
                            <p className="text-muted-foreground">
                              Gasto: {formatMoneyMinorUnits(Math.round((payload[0].value as number) * 100))}
                            </p>
                          </ChartTooltipBox>
                        );
                      }}
                    />
                    <Bar dataKey="gasto" radius={[4, 4, 0, 0]} maxBarSize={36}>
                      {gastoChartData.map((entry) => (
                        <Cell
                          key={entry.fecha}
                          fill={
                            ws.promedioHistorico != null &&
                            entry.gasto * 100 > ws.promedioHistorico * 1.2
                              ? "#ef4444"
                              : ws.promedioHistorico != null &&
                                  entry.gasto * 100 < ws.promedioHistorico * 0.8
                                ? "#22c55e"
                                : "#6366f1"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {ws.promedioHistorico != null ? (
                <p className="mt-1 text-center text-[10px] text-muted-foreground">
                  Rojo = +20% sobre promedio · Verde = -20% bajo promedio
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Patrimonio disponible */}
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Patrimonio disponible</CardTitle>
              <CardDescription>Efectivo + banco por semana</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56 w-full sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={patrimonioChartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={44} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={40}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("es-CL", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(v)
                      }
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload as (typeof patrimonioChartData)[number];
                        return (
                          <ChartTooltipBox>
                            <p className="font-medium text-foreground">{label}</p>
                            <p className="text-muted-foreground">
                              Total: {formatMoneyMinorUnits(Math.round(d.total * 100))}
                            </p>
                            <p className="text-muted-foreground">
                              Efectivo: {formatMoneyMinorUnits(Math.round(d.efectivo * 100))}
                            </p>
                            <p className="text-muted-foreground">
                              Banco: {formatMoneyMinorUnits(Math.round(d.transferencia * 100))}
                            </p>
                          </ChartTooltipBox>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Area
                      type="monotone"
                      dataKey="efectivo"
                      name="Efectivo"
                      stackId="1"
                      stroke="#6366f1"
                      fill="#6366f1"
                      fillOpacity={0.3}
                    />
                    <Area
                      type="monotone"
                      dataKey="transferencia"
                      name="Banco"
                      stackId="1"
                      stroke="#14b8a6"
                      fill="#14b8a6"
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ============================================================ */}
      {/*  CHARTS ROW 2: Tendencia + Gasto vs promedio                 */}
      {/* ============================================================ */}
      {mediaMovilData.length > 2 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tendencia del gasto</CardTitle>
              <CardDescription>
                Media móvil 4 semanas vs gasto puntual
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56 w-full sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mediaMovilData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={44} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={40}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("es-CL", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(v)
                      }
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload as (typeof mediaMovilData)[number];
                        return (
                          <ChartTooltipBox>
                            <p className="font-medium text-foreground">{label}</p>
                            <p className="text-muted-foreground">
                              Gasto: {formatMoneyMinorUnits(Math.round(d.gasto * 100))}
                            </p>
                            <p className="text-muted-foreground">
                              Media 4 sem: {formatMoneyMinorUnits(Math.round(d.media * 100))}
                            </p>
                          </ChartTooltipBox>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Line type="monotone" dataKey="gasto" name="Gasto" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="media" name="Media 4 sem" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {gastosVsPromedioData.length > 0 ? (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Gasto vs promedio</CardTitle>
                <CardDescription>
                  Cada barra vs tu promedio histórico (línea)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56 w-full sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gastosVsPromedioData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={44} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        width={40}
                        tickFormatter={(v) =>
                          new Intl.NumberFormat("es-CL", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(v)
                        }
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload as (typeof gastosVsPromedioData)[number];
                          return (
                            <ChartTooltipBox>
                              <p className="font-medium text-foreground">{label}</p>
                              <p className="text-muted-foreground">
                                Gasto: {formatMoneyMinorUnits(Math.round(d.gasto * 100))}
                              </p>
                              <p className="text-muted-foreground">
                                Promedio: {formatMoneyMinorUnits(Math.round(d.promedio * 100))}
                              </p>
                            </ChartTooltipBox>
                          );
                        }}
                      />
                      <Bar dataKey="gasto" name="Gasto" radius={[4, 4, 0, 0]} maxBarSize={36} fill="#6366f1" />
                      <Line type="monotone" dataKey="promedio" name="Promedio histórico" stroke="#ef4444" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ============================================================ */}
      {/*  CUOTAS: Proyección 12 meses + Pie                          */}
      {/* ============================================================ */}
      {hayDatosCuotas ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Proyección cuotas 12 meses
              </CardTitle>
              <CardDescription>
                Carga mensual en pesos (USD convertido a ×
                {tipoCambio.toLocaleString("es-AR")})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56 w-full sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={proyeccionBarData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={50} />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      width={44}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("es-AR", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(v)
                      }
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload as (typeof proyeccionBarData)[number];
                        return (
                          <ChartTooltipBox>
                            <p className="font-medium capitalize text-foreground">
                              {mesLabelLargo(d.mesISO)}
                            </p>
                            {d.clp > 0 ? (
                              <p className="text-muted-foreground">
                                Pesos: {formatCuotaMoney(Math.round(d.clp * 100), "CLP")}
                              </p>
                            ) : null}
                            {d.usd > 0 ? (
                              <p className="text-muted-foreground">
                                {formatCuotaMoney(Math.round(d.usd * 100), "USD")}
                              </p>
                            ) : null}
                            <p className="mt-1 border-t border-border pt-1 font-medium text-foreground">
                              Total ≈ {formatMoneyMinorUnits(Math.round(d.totalPesos * 100))}
                            </p>
                          </ChartTooltipBox>
                        );
                      }}
                    />
                    <Bar dataKey="totalPesos" name="Total en pesos" radius={[4, 4, 0, 0]} maxBarSize={36}>
                      {proyeccionBarData.map((entry) => (
                        <Cell
                          key={entry.mesISO}
                          fill={
                            cs.mesMasCaro && entry.mesISO === cs.mesMasCaro.mesISO
                              ? "#ef4444"
                              : "#6366f1"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {cs.mesMasCaro && cs.mesMasCaro.totalPesos > 0 ? (
                <p className="mt-1 text-center text-[10px] text-muted-foreground">
                  Mes más cargado en rojo:{" "}
                  <span className="font-medium capitalize">
                    {mesLabelLargo(cs.mesMasCaro.mesISO)}
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <DeudaPorTarjetaPie
            compras={compras}
            tarjetas={tarjetas}
            tipoCambio={tipoCambio}
            mesInicialISO={cs.mesEste}
          />
        </div>
      ) : null}

      {/* ============================================================ */}
      {/*  TOP 5 COMPRAS + Estadísticas extra                         */}
      {/* ============================================================ */}
      {hayDatosCuotas || hayDatosWeekly ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Top 5 compras más caras activas */}
          {top5Compras.length > 0 ? (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Top compras activas (mayor cuota)
                </CardTitle>
                <CardDescription>
                  Las 5 compras pendientes con cuota mensual más alta
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {top5Compras.map((c, i) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                          {c.descripcion}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c.numeroCuotas} cuotas · {cuotasRestantes(c, cs.mesEste)}{" "}
                          restantes
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {formatCuotaMoney(c.cuotaMinorUnits, c.moneda)}
                        <span className="text-xs font-normal text-muted-foreground">
                          /mes
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* Estadísticas extra de gasto */}
          {hayDatosWeekly && ws.conGasto.length > 0 ? (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Estadísticas de gasto
                </CardTitle>
                <CardDescription>Resumen de tus semanas</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <dl className="divide-y divide-border">
                  {[
                    {
                      label: "Máximo semanal",
                      value:
                        ws.maxGasto != null
                          ? formatMoneyMinorUnits(ws.maxGasto)
                          : "—",
                    },
                    {
                      label: "Mínimo semanal",
                      value:
                        ws.minGasto != null
                          ? formatMoneyMinorUnits(ws.minGasto)
                          : "—",
                    },
                    {
                      label: "Promedio histórico",
                      value:
                        ws.promedioHistorico != null
                          ? formatMoneyMinorUnits(
                              Math.round(ws.promedioHistorico)
                            )
                          : "—",
                    },
                    {
                      label: "Total gastado (todas las semanas)",
                      value: formatMoneyMinorUnits(ws.totalGastadoHistorico),
                    },
                    {
                      label: "Semanas con datos",
                      value: String(ws.conGasto.length),
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <dt className="text-sm text-muted-foreground">
                        {row.label}
                      </dt>
                      <dd className="text-sm font-semibold tabular-nums text-foreground">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PIE: deuda por tarjeta con selector de mes                        */
/* ------------------------------------------------------------------ */

function DeudaPorTarjetaPie({
  compras,
  tarjetas,
  tipoCambio,
  mesInicialISO,
}: {
  compras: InstallmentPurchase[];
  tarjetas: { id: string; nombre: string }[];
  tipoCambio: number;
  mesInicialISO: string;
}) {
  const [mesPie, setMesPie] = React.useState(mesInicialISO);

  const tarjetaNombrePorId = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tarjetas) m.set(t.id, t.nombre);
    return m;
  }, [tarjetas]);

  const pieData = React.useMemo(() => {
    const resumen = sumaCuotasEnMesPorTarjeta(
      compras,
      mesPie,
      tarjetaNombrePorId,
      tipoCambio
    );
    return resumen.sort((a, b) => b.value - a.value);
  }, [compras, mesPie, tarjetaNombrePorId, tipoCambio]);

  if (pieData.length === 0 && mesPie === mesInicialISO) return null;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Deuda por tarjeta</CardTitle>
            <CardDescription>
              Distribución de cuotas del mes seleccionado
            </CardDescription>
          </div>
          <input
            type="month"
            value={mesPie}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) setMesPie(e.target.value);
            }}
            className="h-8 w-full max-w-[10rem] cursor-pointer rounded-md border border-input bg-background px-2 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:w-auto"
          />
        </div>
      </CardHeader>
      <CardContent>
        {pieData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Sin cuotas en {mesLabelLargo(mesPie)}.
          </p>
        ) : (
          <div className="h-56 w-full sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="75%"
                  innerRadius="40%"
                  paddingAngle={2}
                  label={({
                    name,
                    percent,
                  }: // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  any) =>
                    `${name ?? ""}: ${(((percent as number) ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((_, i) => (
                    <Cell
                      key={`pie-${i}`}
                      fill={COLORES_PIE[i % COLORES_PIE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0];
                    return (
                      <ChartTooltipBox>
                        <p className="font-medium text-foreground">{d.name}</p>
                        <p className="text-muted-foreground">
                          {formatMoneyMinorUnits(
                            Math.round((d.value as number) * 100)
                          )}
                        </p>
                      </ChartTooltipBox>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Cuotas de un mes agrupadas por tarjeta, todo normalizado a pesos. */
function sumaCuotasEnMesPorTarjeta(
  compras: InstallmentPurchase[],
  mesISO: string,
  tarjetaNombrePorId: Map<string, string>,
  tipoCambio: number
): { name: string; value: number }[] {
  const acum = new Map<string, number>();
  for (const p of compras) {
    const base = mesInicioDate(p.inicioMesISO);
    for (let k = 0; k < p.numeroCuotas; k++) {
      const m = format(addMonths(base, k), "yyyy-MM");
      if (m !== mesISO) continue;
      const tid = p.tarjetaId ?? "__none__";
      const monto =
        p.moneda === "USD"
          ? (p.cuotaMinorUnits / 100) * tipoCambio * 100
          : p.cuotaMinorUnits;
      acum.set(tid, (acum.get(tid) ?? 0) + monto);
    }
  }
  const out: { name: string; value: number }[] = [];
  for (const [tid, minor] of acum) {
    const nombre =
      tid === "__none__"
        ? "Sin tarjeta"
        : tarjetaNombrePorId.get(tid) ?? "Tarjeta eliminada";
    out.push({ name: nombre, value: minor / 100 });
  }
  return out;
}
