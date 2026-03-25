"use client";

import * as React from "react";
import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  compraTodaPagada,
  isPagoTarjetaMesMarcado,
  mesTodasCuotasTarjetaPagadas,
} from "@/lib/cuotas-tarjeta-pagos";
import {
  detalleLineasCuotaMesPorTarjeta,
  estadoCompra,
  proyeccionSeisMeses,
  resumenPagosPorTarjetaEnMes,
  sumaCuotasEnMesPorMoneda,
  ultimoMesPagoISO,
} from "@/lib/installments";
import {
  formatCuotaMoney,
  formatUsdMayorCompacto,
  labelMoneda,
  minorUnitsToInputString,
  parseMoneyInputToMinorUnits,
} from "@/lib/money";
import { LoadingData } from "@/components/loading-data";
import { cn } from "@/lib/utils";
import { useExpenseStore } from "@/stores/use-expense-store";
import type {
  InstallmentPurchase,
  MonedaCuota,
  TarjetaCredito,
} from "@/types/expenses";

type MesProyeccionFilas = {
  mesISO: string;
  etiqueta: string;
  montoMinorCLP: number;
  montoMinorUSD: number;
  clp: number;
  usd: number;
  /** Pesos nativos y USD pasados a pesos con `tipoCambio` (solo escala unificada). */
  equivClp: number;
  equivUsd: number;
  mesTodoPagado: boolean;
};

const COLOR_BARRA_PENDIENTE = "#9ca3af";
const COLOR_BARRA_PAGADO = "#22c55e";

function mesLabel(mesISO: string): string {
  return format(parseISO(`${mesISO}-01`), "MMMM yyyy", { locale: es });
}

const selectLikeInputClass =
  "h-11 min-h-11 w-full cursor-pointer rounded-lg border border-input bg-background px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9 md:text-sm touch-manipulation";

type MontoModo = "total" | "cuota";
type CuotaDialogMode = "create" | "edit";

export function GestionCuotasView() {
  const isLoading = useExpenseStore((s) => s.isLoading);
  const compras = useExpenseStore((s) => s.installmentPurchases);
  const tarjetas = useExpenseStore((s) => s.tarjetas);
  const addInstallmentPurchase = useExpenseStore((s) => s.addInstallmentPurchase);
  const updateInstallmentPurchase = useExpenseStore(
    (s) => s.updateInstallmentPurchase
  );
  const addTarjeta = useExpenseStore((s) => s.addTarjeta);
  const removeTarjeta = useExpenseStore((s) => s.removeTarjeta);
  const cuotasTarjetaPagadasKeys = useExpenseStore(
    (s) => s.cuotasTarjetaPagadasKeys
  );
  const togglePagoTarjetaMes = useExpenseStore((s) => s.togglePagoTarjetaMes);
  const mesCuotasVistaISO = useExpenseStore((s) => s.mesCuotasVistaISO);
  const setMesCuotasVistaISO = useExpenseStore((s) => s.setMesCuotasVistaISO);
  const tipoCambioPesosPorUsd = useExpenseStore((s) => s.tipoCambioPesosPorUsd);
  const setTipoCambioPesosPorUsd = useExpenseStore(
    (s) => s.setTipoCambioPesosPorUsd
  );

  const [dolarBlueEstado, setDolarBlueEstado] = React.useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [dolarBlueMeta, setDolarBlueMeta] = React.useState<string | null>(null);
  /** Claves `${tarjetaId|null}-${moneda}`; varias filas de detalle pueden estar abiertas. */
  const [tarjetaDetalleAbiertaKeys, setTarjetaDetalleAbiertaKeys] = React.useState<
    Set<string>
  >(() => new Set());

  React.useEffect(() => {
    setTarjetaDetalleAbiertaKeys(new Set());
  }, [mesCuotasVistaISO]);

  const [cuotaDialogOpen, setCuotaDialogOpen] = React.useState(false);
  const [cuotaDialogMode, setCuotaDialogMode] =
    React.useState<CuotaDialogMode>("create");
  const [editCompraId, setEditCompraId] = React.useState<string | null>(null);
  const [tarjetasDialogOpen, setTarjetasDialogOpen] = React.useState(false);
  const [nuevaTarjetaNombre, setNuevaTarjetaNombre] = React.useState("");
  const [descripcion, setDescripcion] = React.useState("");
  const [montoModo, setMontoModo] = React.useState<MontoModo>("total");
  const [montoStr, setMontoStr] = React.useState("");
  const [cuotasStr, setCuotasStr] = React.useState("12");
  const [inicioMes, setInicioMes] = React.useState(() =>
    format(new Date(), "yyyy-MM")
  );
  const [tarjetaNuevaCompraId, setTarjetaNuevaCompraId] = React.useState("");
  const [monedaNuevaCompra, setMonedaNuevaCompra] =
    React.useState<MonedaCuota>("CLP");
  const [formError, setFormError] = React.useState<string | null>(null);

  const ahora = React.useMemo(() => new Date(), []);
  const mesEste = format(startOfMonth(ahora), "yyyy-MM");
  const mesSiguiente = format(addMonths(startOfMonth(ahora), 1), "yyyy-MM");

  const pagarEsteMesPorMoneda = React.useMemo(
    () => sumaCuotasEnMesPorMoneda(compras, mesEste),
    [compras, mesEste]
  );
  const pagarMesSiguientePorMoneda = React.useMemo(
    () => sumaCuotasEnMesPorMoneda(compras, mesSiguiente),
    [compras, mesSiguiente]
  );

  const resumenMesVistaTarjetas = React.useMemo(
    () =>
      resumenPagosPorTarjetaEnMes(compras, tarjetas, mesCuotasVistaISO),
    [compras, tarjetas, mesCuotasVistaISO]
  );

  const chartData = React.useMemo(() => {
    return proyeccionSeisMeses(compras, ahora).map((r) => {
      const mesTodoPagado = mesTodasCuotasTarjetaPagadas(
        compras,
        tarjetas,
        r.mesISO,
        cuotasTarjetaPagadasKeys
      );
      const clp = r.montoMinorCLP / 100;
      const usd = r.montoMinorUSD / 100;
      return {
        ...r,
        clp,
        usd,
        equivClp: clp,
        equivUsd: usd * tipoCambioPesosPorUsd,
        mesTodoPagado,
      };
    });
  }, [
    compras,
    ahora,
    tarjetas,
    cuotasTarjetaPagadasKeys,
    tipoCambioPesosPorUsd,
  ]);

  const tieneClpEnChart = React.useMemo(
    () => chartData.some((r) => r.montoMinorCLP > 0),
    [chartData]
  );
  const tieneUsdEnChart = React.useMemo(
    () => chartData.some((r) => r.montoMinorUSD > 0),
    [chartData]
  );
  const chartEscalaUnificada = tieneClpEnChart && tieneUsdEnChart;
  const chartModoGrafico: "unificado" | "soloPesos" | "soloUsd" =
    chartEscalaUnificada
      ? "unificado"
      : tieneUsdEnChart
        ? "soloUsd"
        : "soloPesos";

  async function aplicarDolarBlue() {
    setDolarBlueEstado("loading");
    setDolarBlueMeta(null);
    try {
      const r = await fetch("/api/dolar-blue");
      const j = (await r.json()) as { blueAvg?: number; lastUpdate?: string };
      if (!r.ok || typeof j.blueAvg !== "number" || !Number.isFinite(j.blueAvg)) {
        throw new Error("bad response");
      }
      setTipoCambioPesosPorUsd(j.blueAvg);
      setDolarBlueEstado("ok");
      setDolarBlueMeta(j.lastUpdate ?? null);
    } catch {
      setDolarBlueEstado("error");
    }
  }

  const montoIngresadoMinor = parseMoneyInputToMinorUnits(montoStr);
  const nCuotas = Math.max(0, Math.floor(Number.parseInt(cuotasStr, 10) || 0));
  let cuotaPreview: number | null = null;
  let totalPreview: number | null = null;
  if (montoModo === "total") {
    if (montoIngresadoMinor != null && nCuotas > 0) {
      totalPreview = montoIngresadoMinor;
      cuotaPreview = Math.round(montoIngresadoMinor / nCuotas);
    }
  } else if (montoIngresadoMinor != null && nCuotas > 0) {
    cuotaPreview = Math.round(montoIngresadoMinor);
    totalPreview = cuotaPreview * nCuotas;
  }
  const hastaPreview =
    nCuotas > 0 && /^\d{4}-\d{2}$/.test(inicioMes)
      ? ultimoMesPagoISO(inicioMes, nCuotas)
      : null;

  function resetForm() {
    setDescripcion("");
    setMontoModo("total");
    setMontoStr("");
    setCuotasStr("12");
    setInicioMes(format(new Date(), "yyyy-MM"));
    setTarjetaNuevaCompraId("");
    setMonedaNuevaCompra("CLP");
    setFormError(null);
  }

  function openNuevaCompra() {
    resetForm();
    setCuotaDialogMode("create");
    setEditCompraId(null);
    setCuotaDialogOpen(true);
  }

  function openEditarCompra(compra: InstallmentPurchase) {
    setDescripcion(compra.descripcion);
    setMontoModo("total");
    setMontoStr(minorUnitsToInputString(compra.totalMinorUnits));
    setCuotasStr(String(compra.numeroCuotas));
    setInicioMes(compra.inicioMesISO);
    setMonedaNuevaCompra(compra.moneda);
    setTarjetaNuevaCompraId(compra.tarjetaId ?? "");
    setFormError(null);
    setCuotaDialogMode("edit");
    setEditCompraId(compra.id);
    setCuotaDialogOpen(true);
  }

  function handleCuotaDialogChange(open: boolean) {
    setCuotaDialogOpen(open);
    if (!open) {
      resetForm();
      setCuotaDialogMode("create");
      setEditCompraId(null);
    }
  }

  function handleAgregarTarjeta(e: React.FormEvent) {
    e.preventDefault();
    const n = nuevaTarjetaNombre.trim();
    if (!n) return;
    addTarjeta(n);
    setNuevaTarjetaNombre("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const d = descripcion.trim();
    if (!d) {
      setFormError("Ingresá una descripción.");
      return;
    }

    const parsed = parseMoneyInputToMinorUnits(montoStr);
    if (parsed === null || parsed < 1) {
      setFormError(
        montoModo === "total"
          ? "El monto total no es válido."
          : "El monto de la cuota no es válido."
      );
      return;
    }

    const n = Math.floor(Number.parseInt(cuotasStr, 10));
    if (!Number.isFinite(n) || n < 1) {
      setFormError("La cantidad de cuotas debe ser al menos 1.");
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(inicioMes)) {
      setFormError("Elegí mes y año de inicio.");
      return;
    }

    const totalMinorUnits =
      montoModo === "total" ? parsed : Math.round(parsed) * n;

    const payload = {
      descripcion: d,
      totalMinorUnits,
      numeroCuotas: n,
      inicioMesISO: inicioMes,
      tarjetaId: tarjetaNuevaCompraId || null,
      moneda: monedaNuevaCompra,
    };

    if (cuotaDialogMode === "edit" && editCompraId) {
      updateInstallmentPurchase(editCompraId, payload);
    } else {
      addInstallmentPurchase(payload);
    }
    setCuotaDialogOpen(false);
    resetForm();
    setCuotaDialogMode("create");
    setEditCompraId(null);
  }

  const filasOrdenadas = React.useMemo(() => {
    return [...compras].sort((a, b) => {
      const aPagada = compraTodaPagada(a, cuotasTarjetaPagadasKeys) ? 1 : 0;
      const bPagada = compraTodaPagada(b, cuotasTarjetaPagadasKeys) ? 1 : 0;
      if (aPagada !== bPagada) return aPagada - bPagada;
      return b.creadoEn.localeCompare(a.creadoEn);
    });
  }, [compras, cuotasTarjetaPagadasKeys]);

  const inputClass =
    "min-h-11 w-full text-base touch-manipulation md:min-h-9 md:text-sm";
  const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

  if (isLoading) return <LoadingData />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Gestión de cuotas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Proyectá cuánto pagás por mes y seguí tus compras en cuotas.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          <Dialog open={tarjetasDialogOpen} onOpenChange={setTarjetasDialogOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full touch-manipulation sm:w-auto sm:min-h-9"
              >
                Mis tarjetas
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-h-[min(90dvh,640px)] overflow-y-auto sm:max-w-md"
              showCloseButton
            >
              <DialogHeader>
                <DialogTitle>Mis tarjetas</DialogTitle>
                <DialogDescription>
                  Cargá las tarjetas con las que pagás. Después podés elegir una
                  en cada compra en cuotas.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAgregarTarjeta} className="flex flex-col gap-2">
                <label htmlFor="nueva-tarjeta" className={labelClass}>
                  Nueva tarjeta
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="nueva-tarjeta"
                    value={nuevaTarjetaNombre}
                    onChange={(e) => setNuevaTarjetaNombre(e.target.value)}
                    placeholder="Ej. Visa Santander"
                    className={inputClass}
                    autoComplete="off"
                  />
                  <Button
                    type="submit"
                    className="min-h-11 shrink-0 touch-manipulation sm:min-h-9"
                  >
                    Agregar
                  </Button>
                </div>
              </form>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {tarjetas.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Todavía no cargaste ninguna tarjeta.
                  </li>
                ) : (
                  tarjetas.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 px-3 py-3"
                    >
                      <span className="min-w-0 font-medium wrap-break-word">
                        {t.nombre}
                      </span>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          if (
                            typeof window !== "undefined" &&
                            !window.confirm(
                              `¿Eliminar “${t.nombre}”? Las compras que la usaban quedarán sin tarjeta asignada.`
                            )
                          ) {
                            return;
                          }
                          removeTarjeta(t.id);
                        }}
                      >
                        Quitar
                      </Button>
                    </li>
                  ))
                )}
              </ul>
            </DialogContent>
          </Dialog>

          <Button
            type="button"
            className="min-h-11 w-full shrink-0 touch-manipulation sm:w-auto sm:min-h-9"
            onClick={openNuevaCompra}
          >
            Nueva compra en cuotas
          </Button>
          <Dialog open={cuotaDialogOpen} onOpenChange={handleCuotaDialogChange}>
          <DialogContent
            showCloseButton
            className={cn(
              "flex max-h-dvh flex-col gap-0 overflow-hidden rounded-none p-0 sm:rounded-xl",
              "max-sm:top-0 max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-none",
              "max-sm:translate-x-0 max-sm:translate-y-0",
              "sm:top-1/2 sm:left-1/2 sm:h-auto sm:max-h-[min(90vh,720px)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2"
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => {
              if ((e.target as HTMLElement).tagName === "SELECT") {
                e.preventDefault();
              }
            }}
          >
            <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-3 sm:pt-4">
              <DialogTitle>
                {cuotaDialogMode === "edit"
                  ? "Editar compra en cuotas"
                  : "Nueva compra en cuotas"}
              </DialogTitle>
              <DialogDescription>
                {cuotaDialogMode === "edit"
                  ? "Modificá los datos y guardá. Las marcas de «pagado» por tarjeta siguen ligadas a mes y tarjeta."
                  : "Completá los datos. El valor de cada cuota y la fecha de cierre se calculan solos."}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div>
                  <label htmlFor="cuota-desc" className={labelClass}>
                    Descripción
                  </label>
                  <Input
                    id="cuota-desc"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Ej. Notebook, heladera…"
                    className={inputClass}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <span className={labelClass}>¿Qué monto cargás?</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={montoModo === "total" ? "default" : "outline"}
                      className="min-h-11 touch-manipulation sm:min-h-9"
                      onClick={() => setMontoModo("total")}
                    >
                      Monto total
                    </Button>
                    <Button
                      type="button"
                      variant={montoModo === "cuota" ? "default" : "outline"}
                      className="min-h-11 touch-manipulation sm:min-h-9"
                      onClick={() => setMontoModo("cuota")}
                    >
                      Valor de cada cuota
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className={labelClass}>Moneda del monto</span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={
                        monedaNuevaCompra === "CLP" ? "default" : "outline"
                      }
                      className="min-h-11 touch-manipulation sm:min-h-9"
                      onClick={() => setMonedaNuevaCompra("CLP")}
                    >
                      Pesos (CLP)
                    </Button>
                    <Button
                      type="button"
                      variant={
                        monedaNuevaCompra === "USD" ? "default" : "outline"
                      }
                      className="min-h-11 touch-manipulation sm:min-h-9"
                      onClick={() => setMonedaNuevaCompra("USD")}
                    >
                      USD
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Las compras que ya tenés guardadas siguen en pesos. Las nuevas
                    pueden ser en USD si elegís acá.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor={montoModo === "total" ? "cuota-monto" : "cuota-monto-cuota"}
                    className={labelClass}
                  >
                    {montoModo === "total"
                      ? "Monto total de la compra"
                      : "Valor de cada cuota"}
                  </label>
                  <Input
                    id={montoModo === "total" ? "cuota-monto" : "cuota-monto-cuota"}
                    key={montoModo}
                    inputMode="decimal"
                    value={montoStr}
                    onChange={(e) => setMontoStr(e.target.value)}
                    placeholder="0"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {montoModo === "total"
                      ? "Se calcula sola la cuota dividiendo por la cantidad de pagos."
                      : "El total será la cuota × cantidad de cuotas (sin redondeos raros entre medias)."}
                  </p>
                </div>

                <div>
                  <label htmlFor="cuota-n" className={labelClass}>
                    Cantidad de cuotas
                  </label>
                  <Input
                    id="cuota-n"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={cuotasStr}
                    onChange={(e) => setCuotasStr(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="cuota-inicio" className={labelClass}>
                    Fecha de inicio (mes / año)
                  </label>
                  <Input
                    id="cuota-inicio"
                    type="month"
                    value={inicioMes}
                    onChange={(e) => setInicioMes(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="cuota-tarjeta" className={labelClass}>
                    Tarjeta <span className="font-normal">(opcional)</span>
                  </label>
                  <select
                    id="cuota-tarjeta"
                    value={tarjetaNuevaCompraId}
                    onChange={(e) => setTarjetaNuevaCompraId(e.target.value)}
                    className={selectLikeInputClass}
                  >
                    <option value="">Sin asignar</option>
                    {tarjetas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                  {tarjetas.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cargá tarjetas con el botón «Mis tarjetas» para listarlas
                      aquí.
                    </p>
                  ) : null}
                </div>

                {(totalPreview != null ||
                  cuotaPreview != null ||
                  hastaPreview) && (
                  <div
                    className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm"
                    aria-live="polite"
                  >
                    {totalPreview != null ? (
                      <p className="font-medium text-foreground">
                        Monto total:{" "}
                        <span className="tabular-nums">
                          {formatCuotaMoney(totalPreview, monedaNuevaCompra)}
                        </span>
                      </p>
                    ) : null}
                    {cuotaPreview != null ? (
                      <p
                        className={
                          totalPreview != null
                            ? "mt-1 font-medium text-foreground"
                            : "font-medium text-foreground"
                        }
                      >
                        Valor de la cuota:{" "}
                        <span className="tabular-nums">
                          {formatCuotaMoney(cuotaPreview, monedaNuevaCompra)}
                        </span>
                      </p>
                    ) : null}
                    {hastaPreview ? (
                      <p className="mt-1 text-muted-foreground">
                        Fecha hasta:{" "}
                        <span className="font-medium text-foreground">
                          {mesLabel(hastaPreview)}
                        </span>
                      </p>
                    ) : null}
                  </div>
                )}

                {formError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                ) : null}
              </div>

              <DialogFooter className="shrink-0 border-t border-border bg-muted/30 p-4 sm:bg-muted/50">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full touch-manipulation sm:min-h-9 sm:w-auto"
                  onClick={() => handleCuotaDialogChange(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="min-h-11 w-full touch-manipulation sm:min-h-9 sm:w-auto"
                >
                  {cuotaDialogMode === "edit" ? "Actualizar" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              A pagar este mes
            </CardTitle>
            <CardDescription className="capitalize">
              {mesLabel(mesEste)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pagarEsteMesPorMoneda.CLP > 0 ? (
              <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
                {formatCuotaMoney(pagarEsteMesPorMoneda.CLP, "CLP")}
              </p>
            ) : null}
            {pagarEsteMesPorMoneda.USD > 0 ? (
              <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
                {formatCuotaMoney(pagarEsteMesPorMoneda.USD, "USD")}
              </p>
            ) : null}
            {pagarEsteMesPorMoneda.CLP === 0 &&
            pagarEsteMesPorMoneda.USD === 0 ? (
              <p className="text-lg font-medium text-muted-foreground">
                Sin cuotas este mes
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">
              A pagar el mes siguiente
            </CardTitle>
            <CardDescription className="capitalize">
              {mesLabel(mesSiguiente)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pagarMesSiguientePorMoneda.CLP > 0 ? (
              <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
                {formatCuotaMoney(pagarMesSiguientePorMoneda.CLP, "CLP")}
              </p>
            ) : null}
            {pagarMesSiguientePorMoneda.USD > 0 ? (
              <p className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
                {formatCuotaMoney(pagarMesSiguientePorMoneda.USD, "USD")}
              </p>
            ) : null}
            {pagarMesSiguientePorMoneda.CLP === 0 &&
            pagarMesSiguientePorMoneda.USD === 0 ? (
              <p className="text-lg font-medium text-muted-foreground">
                Sin cuotas ese mes
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="px-4 pt-4 pb-2 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <CardTitle className="text-lg">Cuotas por tarjeta</CardTitle>
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:min-w-[12.5rem]">
              <label
                htmlFor="mes-cuotas-vista"
                className="text-xs font-medium text-muted-foreground"
              >
                Mes
              </label>
              <input
                id="mes-cuotas-vista"
                type="month"
                value={mesCuotasVistaISO}
                onChange={(e) => setMesCuotasVistaISO(e.target.value)}
                className={cn(selectLikeInputClass, "sm:max-w-[14rem]")}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6">
          {resumenMesVistaTarjetas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay cuotas para este mes según tus compras y tarjetas
              asignadas.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {resumenMesVistaTarjetas.map((r) => {
                const rowKey = `${r.tarjetaId ?? "none"}-${r.moneda}`;
                const detalleAbierto = tarjetaDetalleAbiertaKeys.has(rowKey);
                const pagado = isPagoTarjetaMesMarcado(
                  cuotasTarjetaPagadasKeys,
                  mesCuotasVistaISO,
                  r.tarjetaId,
                  r.moneda
                );
                const lineasDetalle = detalleAbierto
                  ? detalleLineasCuotaMesPorTarjeta(
                      compras,
                      mesCuotasVistaISO,
                      r.tarjetaId,
                      r.moneda
                    )
                  : [];
                return (
                  <li key={rowKey} className="px-3 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        className={cn(
                          "min-w-0 flex-1 rounded-md text-left outline-none transition-colors",
                          "hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                          "-m-1 p-1 sm:m-0 sm:p-1"
                        )}
                        aria-expanded={detalleAbierto}
                        aria-controls={`detalle-cuotas-${rowKey}`}
                        id={`toggle-detalle-${rowKey}`}
                        onClick={() =>
                          setTarjetaDetalleAbiertaKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(rowKey)) next.delete(rowKey);
                            else next.add(rowKey);
                            return next;
                          })
                        }
                      >
                        <span className="font-medium text-foreground">
                          {r.etiqueta}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            ({labelMoneda(r.moneda)})
                          </span>
                        </span>
                        <span
                          className={cn(
                            "mt-1 block text-lg font-semibold tabular-nums sm:mt-0 sm:ml-2 sm:inline",
                            pagado && "text-muted-foreground line-through"
                          )}
                        >
                          {formatCuotaMoney(r.montoMinor, r.moneda)}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {detalleAbierto ? "Ocultar detalle" : "Ver compras"}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant={pagado ? "default" : "outline"}
                        size="sm"
                        aria-pressed={pagado}
                        className={cn(
                          "min-h-9 shrink-0 touch-manipulation",
                          pagado &&
                            "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
                        )}
                        onClick={() =>
                          togglePagoTarjetaMes(
                            mesCuotasVistaISO,
                            r.tarjetaId,
                            r.moneda
                          )
                        }
                      >
                        {pagado ? "Pagado" : "Marcar pagado"}
                      </Button>
                    </div>
                    {detalleAbierto ? (
                      <ul
                        id={`detalle-cuotas-${rowKey}`}
                        role="region"
                        aria-labelledby={`toggle-detalle-${rowKey}`}
                        className="mt-3 space-y-2 border-t border-border pt-3"
                      >
                        {lineasDetalle.length === 0 ? (
                          <li className="text-sm text-muted-foreground">
                            No hay ítems para mostrar.
                          </li>
                        ) : (
                          lineasDetalle.map((linea) => (
                            <li
                              key={linea.id}
                              className="flex flex-col gap-0.5 rounded-md border border-sky-400/60 bg-muted/40 px-2.5 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3 dark:border-sky-500/45"
                            >
                              <span className="min-w-0 font-medium text-foreground wrap-break-word">
                                {linea.descripcion}
                                <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                                  (cuota {linea.indiceCuota}/{linea.numeroCuotas})
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums font-semibold text-foreground">
                                {formatCuotaMoney(
                                  linea.montoMinorUnits,
                                  r.moneda
                                )}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="px-4 pt-4 pb-2 sm:px-6">
          <CardTitle className="text-lg">
            Proyección próximos 6 meses
          </CardTitle>
          <CardDescription>
            Barras grises mientras falte marcar pagos de ese mes; en verde cuando
            está todo pagado. Si hay pesos y dólares en la proyección, una sola
            escala en pesos (los USD se llevan a pesos con el tipo que elijas).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 pb-4 sm:px-6">
          {chartData.every(
            (r) => r.montoMinorCLP === 0 && r.montoMinorUSD === 0
          ) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Agreá compras en cuotas para ver la proyección.
            </p>
          ) : (
            <>
              {chartEscalaUnificada ? (
                <div className="mb-4 space-y-2 border-b border-border px-2 pb-4 sm:px-0">
                  <p className="text-sm text-muted-foreground">
                    Comparación justa: el eje es siempre en pesos. El botón trae
                    el dólar blue promedio en Argentina (Bluelytics; el mismo
                    tipo rige en todo el país, incluida Córdoba). Podés ajustar
                    el número a mano si preferís otro criterio.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1">
                      <label
                        htmlFor="tipo-usd-grafico"
                        className="mb-1 block text-sm font-medium text-foreground"
                      >
                        Pesos por 1 USD (solo este gráfico)
                      </label>
                      <Input
                        id="tipo-usd-grafico"
                        type="number"
                        inputMode="decimal"
                        min={1}
                        step={1}
                        className={inputClass}
                        value={tipoCambioPesosPorUsd}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          if (!Number.isNaN(n) && n > 0) {
                            setTipoCambioPesosPorUsd(n);
                          }
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 w-full shrink-0 touch-manipulation sm:w-auto sm:min-h-9"
                      disabled={dolarBlueEstado === "loading"}
                      onClick={() => void aplicarDolarBlue()}
                    >
                      {dolarBlueEstado === "loading"
                        ? "Consultando…"
                        : "Dólar blue (Bluelytics)"}
                    </Button>
                  </div>
                  {dolarBlueEstado === "error" ? (
                    <p className="text-xs text-destructive" role="alert">
                      No se pudo obtener la cotización. Probá de nuevo más tarde.
                    </p>
                  ) : null}
                  {dolarBlueEstado === "ok" && dolarBlueMeta ? (
                    <p className="text-xs text-muted-foreground">
                      Última actualización fuente: {dolarBlueMeta}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="h-64 w-full min-w-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{
                      top: 8,
                      right: 8,
                      left: 0,
                      bottom: 8,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="etiqueta"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={48}
                    />
                    {chartModoGrafico === "unificado" ? (
                      <YAxis
                        yAxisId="unified"
                        tick={{ fontSize: 10 }}
                        width={44}
                        tickFormatter={(v) =>
                          new Intl.NumberFormat("es-AR", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(v)
                        }
                      />
                    ) : chartModoGrafico === "soloUsd" ? (
                      <YAxis
                        yAxisId="usd"
                        tick={{ fontSize: 10 }}
                        width={52}
                        tickFormatter={(v) => formatUsdMayorCompacto(v)}
                      />
                    ) : (
                      <YAxis
                        yAxisId="clp"
                        tick={{ fontSize: 10 }}
                        width={40}
                        tickFormatter={(v) =>
                          new Intl.NumberFormat("es-CL", {
                            notation: "compact",
                            maximumFractionDigits: 1,
                          }).format(v)
                        }
                      />
                    )}
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as MesProyeccionFilas;
                        return (
                          <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                            <p className="font-medium capitalize text-foreground">
                              {label}
                            </p>
                            {row.montoMinorCLP > 0 ? (
                              <p className="text-muted-foreground">
                                Pesos:{" "}
                                {formatCuotaMoney(row.montoMinorCLP, "CLP")}
                              </p>
                            ) : null}
                            {row.montoMinorUSD > 0 ? (
                              <p className="text-muted-foreground">
                                {formatCuotaMoney(row.montoMinorUSD, "USD")}
                              </p>
                            ) : null}
                            {chartModoGrafico === "unificado" ? (
                              <p className="mt-1 border-t border-border pt-1 text-[10px] leading-snug text-muted-foreground">
                                Altura de barra USD en el gráfico: monto en USD ×{" "}
                                {tipoCambioPesosPorUsd.toLocaleString("es-AR")}{" "}
                                pesos/USD.
                              </p>
                            ) : null}
                            {row.mesTodoPagado ? (
                              <p className="mt-1 font-medium text-emerald-700">
                                Mes completado (pagado)
                              </p>
                            ) : null}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "11px" }}
                      formatter={(value) => {
                        if (value === "pesos") return "Pesos";
                        if (value === "usdEquiv")
                          return `USD (≈${tipoCambioPesosPorUsd.toLocaleString("es-AR")} pesos/USD)`;
                        if (value === "clp") return "Pesos (CLP)";
                        return "USD";
                      }}
                    />
                    {chartModoGrafico === "unificado" ? (
                      <>
                        <Bar
                          yAxisId="unified"
                          dataKey="equivClp"
                          name="pesos"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={28}
                        >
                          {chartData.map((entry) => (
                            <Cell
                              key={`eqclp-${entry.mesISO}`}
                              fill={
                                entry.mesTodoPagado
                                  ? COLOR_BARRA_PAGADO
                                  : COLOR_BARRA_PENDIENTE
                              }
                            />
                          ))}
                        </Bar>
                        <Bar
                          yAxisId="unified"
                          dataKey="equivUsd"
                          name="usdEquiv"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={28}
                        >
                          {chartData.map((entry) => (
                            <Cell
                              key={`equsd-${entry.mesISO}`}
                              fill={
                                entry.mesTodoPagado
                                  ? COLOR_BARRA_PAGADO
                                  : COLOR_BARRA_PENDIENTE
                              }
                            />
                          ))}
                        </Bar>
                      </>
                    ) : chartModoGrafico === "soloUsd" ? (
                      <Bar
                        yAxisId="usd"
                        dataKey="usd"
                        name="usd"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      >
                        {chartData.map((entry) => (
                          <Cell
                            key={`usd-${entry.mesISO}`}
                            fill={
                              entry.mesTodoPagado
                                ? COLOR_BARRA_PAGADO
                                : COLOR_BARRA_PENDIENTE
                            }
                          />
                        ))}
                      </Bar>
                    ) : (
                      <Bar
                        yAxisId="clp"
                        dataKey="clp"
                        name="clp"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      >
                        {chartData.map((entry) => (
                          <Cell
                            key={`clp-${entry.mesISO}`}
                            fill={
                              entry.mesTodoPagado
                                ? COLOR_BARRA_PAGADO
                                : COLOR_BARRA_PENDIENTE
                            }
                          />
                        ))}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="px-4 pt-4 pb-2 sm:px-6">
          <CardTitle className="text-lg">Compras en cuotas</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-4 sm:px-6">
          {filasOrdenadas.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-0">
              No hay compras cargadas.
            </p>
          ) : (
            <>
              {/* --- mobile: cards --- */}
              <ul className="space-y-3 px-4 md:hidden">
                {filasOrdenadas.map((row) => (
                  <FilaCompraMobile
                    key={row.id}
                    compra={row}
                    tarjetas={tarjetas}
                    onEditar={openEditarCompra}
                    pagada={compraTodaPagada(row, cuotasTarjetaPagadasKeys)}
                  />
                ))}
              </ul>
              {/* --- desktop: table --- */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead className="text-right">Cuotas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Cuota</TableHead>
                      <TableHead>Hasta</TableHead>
                      <TableHead>Tarjeta</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filasOrdenadas.map((row) => (
                      <FilaCompraDesktop
                        key={row.id}
                        compra={row}
                        tarjetas={tarjetas}
                        onEditar={openEditarCompra}
                        pagada={compraTodaPagada(row, cuotasTarjetaPagadasKeys)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function tarjetaNombre(
  tarjetas: TarjetaCredito[],
  tarjetaId: string | null
): string {
  if (!tarjetaId) return "—";
  const t = tarjetas.find((x) => x.id === tarjetaId);
  return t ? t.nombre : "—";
}

type EstadoVisual = "Activa" | "Finalizada" | "Pagada";

function estadoVisual(compra: InstallmentPurchase, pagada: boolean): EstadoVisual {
  if (pagada) return "Pagada";
  return estadoCompra(compra);
}

function estadoBadgeClasses(estado: EstadoVisual): string {
  if (estado === "Pagada")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (estado === "Activa") return "bg-primary/10 text-primary";
  return "bg-muted text-muted-foreground";
}

function FilaCompraDesktop({
  compra,
  tarjetas,
  onEditar,
  pagada,
}: {
  compra: InstallmentPurchase;
  tarjetas: TarjetaCredito[];
  onEditar: (c: InstallmentPurchase) => void;
  pagada: boolean;
}) {
  const hasta = ultimoMesPagoISO(compra.inicioMesISO, compra.numeroCuotas);
  const estado = estadoVisual(compra, pagada);

  return (
    <TableRow className={pagada ? "opacity-60" : undefined}>
      <TableCell className="max-w-[200px] font-medium wrap-break-word">
        {compra.descripcion}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-xs capitalize">
        {mesLabel(compra.inicioMesISO)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {compra.numeroCuotas}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {formatCuotaMoney(compra.totalMinorUnits, compra.moneda)}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {formatCuotaMoney(compra.cuotaMinorUnits, compra.moneda)}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-xs capitalize">
        {mesLabel(hasta)}
      </TableCell>
      <TableCell className="max-w-[120px] truncate text-xs">
        {tarjetaNombre(tarjetas, compra.tarjetaId)}
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            estadoBadgeClasses(estado)
          )}
        >
          {estado}
        </span>
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-7 touch-manipulation"
          onClick={() => onEditar(compra)}
          aria-label={`Editar ${compra.descripcion}`}
        >
          <Pencil />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function FilaCompraMobile({
  compra,
  tarjetas,
  onEditar,
  pagada,
}: {
  compra: InstallmentPurchase;
  tarjetas: TarjetaCredito[];
  onEditar: (c: InstallmentPurchase) => void;
  pagada: boolean;
}) {
  const hasta = ultimoMesPagoISO(compra.inicioMesISO, compra.numeroCuotas);
  const estado = estadoVisual(compra, pagada);
  const nombre = tarjetaNombre(tarjetas, compra.tarjetaId);

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-card p-3",
        pagada && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug text-foreground wrap-break-word">
            {compra.descripcion}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {nombre !== "—" ? nombre : "Sin tarjeta"}
            {" · "}
            <span
              className={cn(
                "inline-flex rounded-full px-1.5 py-px text-[10px] font-medium",
                estadoBadgeClasses(estado)
              )}
            >
              {estado}
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="size-8 shrink-0 touch-manipulation"
          onClick={() => onEditar(compra)}
          aria-label={`Editar ${compra.descripcion}`}
        >
          <Pencil />
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
        <span className="text-muted-foreground">Total</span>
        <span className="text-right font-medium text-foreground">
          {formatCuotaMoney(compra.totalMinorUnits, compra.moneda)}
        </span>
        <span className="text-muted-foreground">Cuota</span>
        <span className="text-right font-medium text-foreground">
          {formatCuotaMoney(compra.cuotaMinorUnits, compra.moneda)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ×{compra.numeroCuotas}
          </span>
        </span>
        <span className="text-muted-foreground">Desde</span>
        <span className="text-right capitalize text-foreground">
          {mesLabel(compra.inicioMesISO)}
        </span>
        <span className="text-muted-foreground">Hasta</span>
        <span className="text-right capitalize text-foreground">
          {mesLabel(hasta)}
        </span>
      </div>
    </li>
  );
}
