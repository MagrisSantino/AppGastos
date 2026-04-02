"use client";

import * as React from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import type { IngresoSemanal, WeeklyExpenseRecord } from "@/types/expenses";

function defaultMondayISO(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function ControlSemanalView() {
  const isLoading = useExpenseStore((s) => s.isLoading);
  const weeklyRecords = useExpenseStore((s) => s.weeklyRecords);
  const ingresosSemanales = useExpenseStore((s) => s.ingresosSemanales);
  const saveWeeklySnapshot = useExpenseStore((s) => s.saveWeeklySnapshot);
  const deleteWeeklyRecordById = useExpenseStore((s) => s.deleteWeeklyRecordById);
  const addIngreso = useExpenseStore((s) => s.addIngreso);
  const deleteIngresoById = useExpenseStore((s) => s.deleteIngresoById);

  const [fecha, setFecha] = React.useState(defaultMondayISO);
  const [efectivoStr, setEfectivoStr] = React.useState("");
  const [transferStr, setTransferStr] = React.useState("");
  const [notaStr, setNotaStr] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [savedHint, setSavedHint] = React.useState(false);
  const [deleteTarget, setDeleteTarget] =
    React.useState<WeeklyExpenseRecord | null>(null);

  // Ingreso mid-week form
  const [ingresoFecha, setIngresoFecha] = React.useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [ingresoMontoStr, setIngresoMontoStr] = React.useState("");
  const [ingresoNotaStr, setIngresoNotaStr] = React.useState("");
  const [ingresoError, setIngresoError] = React.useState<string | null>(null);
  const [ingresoSavedHint, setIngresoSavedHint] = React.useState(false);
  const [deleteIngresoTarget, setDeleteIngresoTarget] =
    React.useState<IngresoSemanal | null>(null);

  React.useEffect(() => {
    const hit = weeklyRecords.find((r) => r.fechaISO === fecha);
    if (hit) {
      setEfectivoStr(minorUnitsToInputString(hit.efectivoMinorUnits));
      setTransferStr(minorUnitsToInputString(hit.transferenciaMinorUnits));
      setNotaStr(hit.nota ?? "");
    } else {
      setEfectivoStr("");
      setTransferStr("");
      setNotaStr("");
    }
  }, [fecha, weeklyRecords]);

  const chartData = React.useMemo(() => {
    const sorted = [...weeklyRecords].sort((a, b) =>
      a.fechaISO.localeCompare(b.fechaISO)
    );
    const result: { fecha: string; etiqueta: string; gasto: number }[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gasto = sorted[i].gastoSemanalMinorUnits;
      if (gasto == null) continue;
      result.push({
        fecha: sorted[i - 1].fechaISO,
        etiqueta: format(parseISO(sorted[i - 1].fechaISO), "d MMM", { locale: es }),
        gasto: gasto / 100,
      });
    }
    return result.slice(-10);
  }, [weeklyRecords]);

  // Para el historial: el gasto se muestra en la semana de INICIO (fila anterior),
  // pero el ingreso extra se muestra en el registro donde fue ingresado.
  const displayGastoMap = React.useMemo(() => {
    const sorted = [...weeklyRecords].sort((a, b) =>
      a.fechaISO.localeCompare(b.fechaISO)
    );
    const map = new Map<string, number | null>();
    for (let i = 0; i < sorted.length; i++) {
      const next = sorted[i + 1];
      map.set(sorted[i].fechaISO, next?.gastoSemanalMinorUnits ?? null);
    }
    return map;
  }, [weeklyRecords]);

  const tableRows = React.useMemo(
    () =>
      [...weeklyRecords].sort((a, b) => b.fechaISO.localeCompare(a.fechaISO)),
    [weeklyRecords]
  );

  const sortedIngresos = React.useMemo(
    () =>
      [...ingresosSemanales].sort((a, b) => b.fechaISO.localeCompare(a.fechaISO)),
    [ingresosSemanales]
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

    saveWeeklySnapshot({
      fechaISO: fecha,
      efectivoMinorUnits: efectivo,
      transferenciaMinorUnits: transferencia,
      nota: notaStr.trim() || null,
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

  function handleAddIngreso(e: React.FormEvent) {
    e.preventDefault();
    setIngresoError(null);
    const monto = parseMoneyInputToMinorUnits(ingresoMontoStr);
    if (monto === null || monto <= 0) {
      setIngresoError("Ingresá un monto válido mayor a 0.");
      return;
    }
    addIngreso(monto, ingresoNotaStr.trim() || null, ingresoFecha);
    setIngresoMontoStr("");
    setIngresoNotaStr("");
    setIngresoFecha(format(new Date(), "yyyy-MM-dd"));
    setIngresoSavedHint(true);
    window.setTimeout(() => setIngresoSavedHint(false), 2500);
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
          Cada lunes registra tu efectivo y banco. El gasto de cada semana
          se calcula al registrar el lunes siguiente y se muestra en la fila
          de esa semana.
        </p>
      </div>

      <Card
        id="semanal-form-card"
        className="scroll-mt-4 border-border shadow-sm"
      >
        <CardHeader className="space-y-1 px-4 pt-4 pb-2 sm:px-6">
          <CardTitle className="text-lg">Registrar o editar</CardTitle>
          <CardDescription>
            Registrá tu efectivo y banco cada lunes. Los ingresos de la semana
            se anotan por separado y se tienen en cuenta al calcular el gasto
            del período. Desde el historial podés cargar una fila para editarla.
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
              <label htmlFor="nota" className={labelClass}>
                Nota <span className="font-normal">(opcional)</span>
              </label>
              <Input
                id="nota"
                autoComplete="off"
                placeholder="Ej: semana cara por mudanza"
                value={notaStr}
                onChange={(e) => setNotaStr(e.target.value)}
                maxLength={120}
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
              Cuando tengas al menos dos cortes semanales registrados, aquí verás
              la evolución del gasto por semana.
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
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Efectivo</TableHead>
                  <TableHead className="text-right">Transferencia</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Gasto semanal</TableHead>
                  <TableHead>Nota</TableHead>
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
                  tableRows.map((r) => {
                    const displayGasto = displayGastoMap.get(r.fechaISO) ?? null;
                    return (
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
                        {displayGasto == null
                          ? "—"
                          : formatMoneyMinorUnits(displayGasto)}
                      </TableCell>
                      <TableCell
                        className="max-w-[180px] truncate text-sm text-muted-foreground"
                        title={r.nota ?? undefined}
                      >
                        {r.nota || "—"}
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
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Ingresos de la semana ─────────────────────────────────── */}
      <Card className="border-border shadow-sm">
        <CardHeader className="px-4 pt-4 pb-2 sm:px-6">
          <CardTitle className="text-lg">Ingresos de la semana</CardTitle>
          <CardDescription>
            Anotá cualquier ingreso (sueldo, extra, etc.) en el momento en que
            llega. No modifica el saldo actual; se usa automáticamente al
            calcular el gasto cuando registres el próximo lunes.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 space-y-5">
          <form onSubmit={handleAddIngreso} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
              <div className="flex flex-col gap-1.5 sm:w-40">
                <label htmlFor="ingreso-fecha" className={labelClass}>
                  Fecha
                </label>
                <Input
                  id="ingreso-fecha"
                  type="date"
                  value={ingresoFecha}
                  onChange={(e) => setIngresoFecha(e.target.value)}
                  className={fieldClass}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label htmlFor="ingreso-monto" className={labelClass}>
                  Monto
                </label>
                <Input
                  id="ingreso-monto"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={ingresoMontoStr}
                  onChange={(e) => setIngresoMontoStr(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-[2]">
                <label htmlFor="ingreso-nota" className={labelClass}>
                  Nota <span className="font-normal">(opcional)</span>
                </label>
                <Input
                  id="ingreso-nota"
                  autoComplete="off"
                  placeholder="Ej: sueldo, aguinaldo…"
                  value={ingresoNotaStr}
                  onChange={(e) => setIngresoNotaStr(e.target.value)}
                  maxLength={120}
                  className={fieldClass}
                />
              </div>
              <Button
                type="submit"
                className="min-h-11 w-full touch-manipulation sm:w-auto sm:min-h-9 sm:self-end"
              >
                <Plus className="mr-1 size-4" />
                Agregar
              </Button>
            </div>
            {ingresoError ? (
              <p className="text-sm text-destructive" role="alert">
                {ingresoError}
              </p>
            ) : null}
            {ingresoSavedHint ? (
              <p className="text-sm font-medium text-primary">Ingreso registrado.</p>
            ) : null}
          </form>

          {sortedIngresos.length > 0 && (
            <div className="overflow-x-auto">
              <Table className="min-w-[500px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedIngresos.map((ing) => (
                    <TableRow key={ing.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(parseISO(ing.fechaISO), "d MMM yyyy", { locale: es })}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums font-medium">
                        {formatMoneyMinorUnits(ing.montoMinorUnits)}
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate text-sm text-muted-foreground"
                        title={ing.nota ?? undefined}
                      >
                        {ing.nota || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-sm"
                          className="size-9 touch-manipulation sm:size-7"
                          onClick={() => setDeleteIngresoTarget(ing)}
                          aria-label="Eliminar ingreso"
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deleteIngresoTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteIngresoTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Eliminar ingreso</DialogTitle>
            <DialogDescription asChild>
              <span>
                Vas a eliminar el ingreso de{" "}
                <strong className="text-foreground">
                  {deleteIngresoTarget
                    ? formatMoneyMinorUnits(deleteIngresoTarget.montoMinorUnits)
                    : ""}
                </strong>{" "}
                del{" "}
                <strong className="text-foreground">
                  {deleteIngresoTarget
                    ? format(parseISO(deleteIngresoTarget.fechaISO), "d MMMM yyyy", { locale: es })
                    : ""}
                </strong>
                . Los gastos semanales se recalcularán.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeleteIngresoTarget(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => {
                if (deleteIngresoTarget) {
                  deleteIngresoById(deleteIngresoTarget.id);
                  setDeleteIngresoTarget(null);
                }
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
