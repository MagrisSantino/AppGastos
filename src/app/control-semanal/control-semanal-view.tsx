"use client";

import * as React from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { es } from "date-fns/locale";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import { LoadingData } from "@/components/loading-data";
import {
  formatMoneyMinorUnits,
  minorUnitsToInputString,
  parseMoneyInputToMinorUnits,
} from "@/lib/money";
import { useExpenseStore } from "@/stores/use-expense-store";
import type { WeeklyExpenseRecord } from "@/types/expenses";

function defaultMondayISO(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function ControlSemanalView() {
  const isLoading = useExpenseStore((s) => s.isLoading);
  const weeklyRecords = useExpenseStore((s) => s.weeklyRecords);
  const saveWeeklySnapshot = useExpenseStore((s) => s.saveWeeklySnapshot);
  const deleteWeeklyRecordById = useExpenseStore((s) => s.deleteWeeklyRecordById);

  const [fecha, setFecha] = React.useState(defaultMondayISO);
  const [efectivoStr, setEfectivoStr] = React.useState("");
  const [transferStr, setTransferStr] = React.useState("");
  const [extraStr, setExtraStr] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [savedHint, setSavedHint] = React.useState(false);
  const [deleteTarget, setDeleteTarget] =
    React.useState<WeeklyExpenseRecord | null>(null);

  React.useEffect(() => {
    const hit = weeklyRecords.find((r) => r.fechaISO === fecha);
    if (hit) {
      setEfectivoStr(minorUnitsToInputString(hit.efectivoMinorUnits));
      setTransferStr(minorUnitsToInputString(hit.transferenciaMinorUnits));
      setExtraStr(
        hit.ingresoExtraMinorUnits == null
          ? ""
          : minorUnitsToInputString(hit.ingresoExtraMinorUnits)
      );
    } else {
      setEfectivoStr("");
      setTransferStr("");
      setExtraStr("");
    }
  }, [fecha, weeklyRecords]);

  const chartData = React.useMemo(() => {
    const sorted = [...weeklyRecords].sort((a, b) =>
      a.fechaISO.localeCompare(b.fechaISO)
    );
    const withGasto = sorted.filter(
      (r): r is typeof r & { gastoSemanalMinorUnits: number } =>
        r.gastoSemanalMinorUnits != null
    );
    return withGasto.slice(-10).map((r) => ({
      fecha: r.fechaISO,
      etiqueta: format(parseISO(r.fechaISO), "d MMM", { locale: es }),
      gasto: r.gastoSemanalMinorUnits / 100,
    }));
  }, [weeklyRecords]);

  const tableRows = React.useMemo(
    () =>
      [...weeklyRecords].sort((a, b) => b.fechaISO.localeCompare(a.fechaISO)),
    [weeklyRecords]
  );

  if (isLoading) return <LoadingData />;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const efectivo = parseMoneyInputToMinorUnits(efectivoStr);
    const transferencia = parseMoneyInputToMinorUnits(transferStr);

    if (efectivo === null || transferencia === null) {
      setFormError(
        "Revisa efectivo y transferencia: usa números válidos (ej. 15000 o 1.234,56)."
      );
      return;
    }

    let ingresoExtra: number | null = null;
    if (extraStr.trim() !== "") {
      const p = parseMoneyInputToMinorUnits(extraStr);
      if (p === null) {
        setFormError("El ingreso extra no es un número válido.");
        return;
      }
      ingresoExtra = p;
    }

    saveWeeklySnapshot({
      fechaISO: fecha,
      efectivoMinorUnits: efectivo,
      transferenciaMinorUnits: transferencia,
      ingresoExtraMinorUnits: ingresoExtra,
    });

    setSavedHint(true);
    window.setTimeout(() => setSavedHint(false), 2500);
  }

  function handleEditRow(row: WeeklyExpenseRecord) {
    setFecha(row.fechaISO);
    setFormError(null);
    window.requestAnimationFrame(() => {
      document
        .getElementById("semanal-form-card")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const removedFecha = deleteTarget.fechaISO;
    deleteWeeklyRecordById(deleteTarget.id);
    setDeleteTarget(null);
    if (fecha === removedFecha) {
      setFecha(defaultMondayISO());
    }
  }

  const fieldClass =
    "min-h-11 w-full text-base md:min-h-9 md:text-sm touch-manipulation";

  const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Control semanal
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada lunes registra tu efectivo y banco; calculamos el gasto de la
          semana anterior.
        </p>
      </div>

      <Card
        id="semanal-form-card"
        className="scroll-mt-4 border-border shadow-sm"
      >
        <CardHeader className="space-y-1 px-4 pt-4 pb-2 sm:px-6">
          <CardTitle className="text-lg">Registrar o editar</CardTitle>
          <CardDescription>
            Gasto semanal = (total semana anterior + ingreso extra) − total
            actual. El ingreso extra corresponde a la semana que cerró. Desde
            el historial podés cargar una fila para editarla.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor="fecha-corte" className={labelClass}>
                Fecha (lunes de corte)
              </label>
              <Input
                id="fecha-corte"
                type="date"
                value={fecha}
                onChange={(ev) => setFecha(ev.target.value)}
                className={fieldClass}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="efectivo" className={labelClass}>
                Efectivo
              </label>
              <Input
                id="efectivo"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={efectivoStr}
                onChange={(e) => setEfectivoStr(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="transferencia" className={labelClass}>
                Transferencia / bancos
              </label>
              <Input
                id="transferencia"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={transferStr}
                onChange={(e) => setTransferStr(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="ingreso-extra" className={labelClass}>
                Ingreso extra <span className="font-normal">(opcional)</span>
              </label>
              <Input
                id="ingreso-extra"
                inputMode="decimal"
                autoComplete="off"
                placeholder="Ingresos de la semana anterior"
                value={extraStr}
                onChange={(e) => setExtraStr(e.target.value)}
                className={fieldClass}
              />
            </div>

            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            {savedHint ? (
              <p className="text-sm font-medium text-primary">
                Registro guardado.
              </p>
            ) : null}

            <Button
              type="submit"
              className="min-h-11 w-full touch-manipulation sm:w-auto sm:min-h-9"
            >
              {weeklyRecords.some((r) => r.fechaISO === fecha)
                ? "Actualizar registro"
                : "Guardar registro"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="px-4 pt-4 pb-2 sm:px-6">
          <CardTitle className="text-lg">Evolución del gasto semanal</CardTitle>
          <CardDescription>
            Últimas semanas con gasto calculado (máx. 10 puntos).
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 pb-4 sm:px-6">
          {chartData.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground sm:px-0">
              Cuando tengas al menos dos cortes semanales, aquí verás la evolución
              del gasto (el primer lunes no tiene semana anterior para comparar).
            </p>
          ) : (
            <div className="h-64 w-full min-w-0 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="etiqueta"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
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
                      const row = payload[0]?.payload as {
                        fecha: string;
                        gasto: number;
                      };
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                          <p className="font-medium text-foreground">{label}</p>
                          <p className="text-muted-foreground">
                            Gasto:{" "}
                            {formatMoneyMinorUnits(Math.round(row.gasto * 100))}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gasto"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader className="px-4 pt-4 pb-2 sm:px-6">
          <CardTitle className="text-lg">Historial</CardTitle>
          <CardDescription>
            En pantallas chicas podés deslizar la tabla horizontalmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-4 sm:px-6">
          <div className="overflow-x-auto px-4 sm:px-0">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Efectivo</TableHead>
                  <TableHead className="text-right">Transferencia</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Ingreso extra</TableHead>
                  <TableHead className="text-right">Gasto semanal</TableHead>
                  <TableHead className="w-[1%] text-right whitespace-nowrap">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Todavía no hay registros.
                    </TableCell>
                  </TableRow>
                ) : (
                  tableRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {format(parseISO(r.fechaISO), "d MMM yyyy", {
                          locale: es,
                        })}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatMoneyMinorUnits(r.efectivoMinorUnits)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatMoneyMinorUnits(r.transferenciaMinorUnits)}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                        {formatMoneyMinorUnits(r.totalMinorUnits)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {r.ingresoExtraMinorUnits == null
                          ? "—"
                          : formatMoneyMinorUnits(r.ingresoExtraMinorUnits)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {r.gastoSemanalMinorUnits == null
                          ? "—"
                          : formatMoneyMinorUnits(r.gastoSemanalMinorUnits)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-stretch gap-2 sm:inline-flex sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="size-9 touch-manipulation sm:size-7"
                            onClick={() => handleEditRow(r)}
                            aria-label={`Editar registro del ${format(parseISO(r.fechaISO), "d MMMM yyyy", { locale: es })}`}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon-sm"
                            className="size-9 touch-manipulation sm:size-7"
                            onClick={() => setDeleteTarget(r)}
                            aria-label={`Eliminar registro del ${format(parseISO(r.fechaISO), "d MMMM yyyy", { locale: es })}`}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Eliminar registro</DialogTitle>
            <DialogDescription asChild>
              <span>
                Vas a eliminar el corte del{" "}
                <strong className="text-foreground">
                  {deleteTarget
                    ? format(parseISO(deleteTarget.fechaISO), "d MMMM yyyy", {
                        locale: es,
                      })
                    : ""}
                </strong>
                . Los gastos semanales de los demás cortes se recalcularán con
                la misma fórmula.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeleteTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={confirmDelete}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
