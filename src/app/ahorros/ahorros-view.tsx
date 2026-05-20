"use client";

import * as React from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, PiggyBank, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingData } from "@/components/loading-data";
import {
  minorUnitsToInputString,
  parseMoneyInputToMinorUnits,
} from "@/lib/money";
import { useExpenseStore } from "@/stores/use-expense-store";
import type { AhorroMetasConfig, CambioSueldo } from "@/types/ahorro";

export function AhorrosView() {
  const isLoading = useExpenseStore((s) => s.isLoading);
  const ahorroMetas = useExpenseStore((s) => s.ahorroMetas);
  const setAhorroMetas = useExpenseStore((s) => s.setAhorroMetas);

  const [sueldoStr, setSueldoStr] = React.useState("");
  const [metaStr, setMetaStr] = React.useState("");
  const [fechaInicio, setFechaInicio] = React.useState("");
  const [fecha, setFecha] = React.useState("");
  const [cambios, setCambios] = React.useState<
    Array<{ id: string; mesISO: string; montoStr: string }>
  >([]);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [savedHint, setSavedHint] = React.useState(false);

  React.useEffect(() => {
    setSueldoStr(
      ahorroMetas.sueldoActual > 0
        ? minorUnitsToInputString(ahorroMetas.sueldoActual)
        : ""
    );
    setMetaStr(
      ahorroMetas.metaAhorro > 0
        ? minorUnitsToInputString(ahorroMetas.metaAhorro)
        : ""
    );
    const inicioGuardada = ahorroMetas.fechaInicio?.trim() ?? "";
    setFechaInicio(
      /^\d{4}-\d{2}-\d{2}$/.test(inicioGuardada)
        ? inicioGuardada
        : format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
    );
    setFecha(ahorroMetas.fechaObjetivo || "");
    setCambios(
      (ahorroMetas.cambiosSueldo ?? []).map((c) => ({
        id: c.id,
        mesISO: c.mesISO,
        montoStr: c.monto > 0 ? minorUnitsToInputString(c.monto) : "",
      }))
    );
  }, [ahorroMetas]);

  const fieldClass =
    "min-h-11 w-full text-base md:min-h-9 md:text-sm touch-manipulation";
  const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

  function addCambio() {
    setCambios((prev) => [
      ...prev,
      { id: crypto.randomUUID(), mesISO: "", montoStr: "" },
    ]);
  }

  function removeCambio(id: string) {
    setCambios((prev) => prev.filter((c) => c.id !== id));
  }

  function updateCambioMes(id: string, mesISO: string) {
    setCambios((prev) => prev.map((c) => (c.id === id ? { ...c, mesISO } : c)));
  }

  function updateCambioMonto(id: string, montoStr: string) {
    setCambios((prev) =>
      prev.map((c) => (c.id === id ? { ...c, montoStr } : c))
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const sueldo = parseMoneyInputToMinorUnits(sueldoStr);
    const meta = parseMoneyInputToMinorUnits(metaStr);

    if (sueldo === null || meta === null) {
      setFormError(
        "Revisá sueldo y meta: usá números válidos (ej. 1500000 o 1.234,56)."
      );
      return;
    }
    if (sueldo < 0 || meta < 0) {
      setFormError("Los montos no pueden ser negativos.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio.trim())) {
      setFormError("Elegí una fecha de inicio del plan válida.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha.trim())) {
      setFormError("Elegí una fecha objetivo válida.");
      return;
    }

    const cambiosSueldo: CambioSueldo[] = [];
    for (const c of cambios) {
      if (!c.mesISO || !/^\d{4}-\d{2}$/.test(c.mesISO)) {
        setFormError("Elegí un mes válido en cada actualización de sueldo.");
        return;
      }
      const monto = parseMoneyInputToMinorUnits(c.montoStr);
      if (monto === null || monto < 0) {
        setFormError("Revisá los montos en las actualizaciones de sueldo.");
        return;
      }
      cambiosSueldo.push({ id: c.id, mesISO: c.mesISO, monto });
    }

    const payload: AhorroMetasConfig = {
      sueldoActual: sueldo,
      metaAhorro: meta,
      fechaInicio: fechaInicio.trim(),
      fechaObjetivo: fecha.trim(),
      cambiosSueldo,
    };
    setAhorroMetas(payload);
    setSavedHint(true);
    window.setTimeout(() => setSavedHint(false), 2500);
  }

  if (isLoading) return <LoadingData />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Metas de ahorro
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El sistema cuenta cuántos sueldos cobrás entre las dos fechas,
          resta la meta y divide el sobrante en las semanas del plan para
          calcular tu presupuesto semanal con arrastre.
        </p>
      </div>

      <Card className="max-w-xl md:max-w-2xl border-border shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <PiggyBank className="size-5 opacity-80" aria-hidden />
            Configuración
          </CardTitle>
          <CardDescription>
            Montos en pesos (misma moneda que el control semanal). No se
            admiten valores negativos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label htmlFor="ahorro-sueldo" className={labelClass}>
                Sueldo mensual (aprox.)
              </label>
              <Input
                id="ahorro-sueldo"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={sueldoStr}
                onChange={(ev) => setSueldoStr(ev.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className={labelClass} style={{ margin: 0 }}>
                  Aumentos de sueldo durante el plan
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addCambio}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Plus className="size-3.5" />
                  Agregar
                </Button>
              </div>
              {cambios.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin aumentos registrados. El sueldo base aplica todo el plan.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {cambios.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <Input
                        type="month"
                        value={c.mesISO}
                        onChange={(ev) => updateCambioMes(c.id, ev.target.value)}
                        className="min-h-11 md:min-h-9"
                      />
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="nuevo sueldo"
                        value={c.montoStr}
                        onChange={(ev) =>
                          updateCambioMonto(c.id, ev.target.value)
                        }
                        className="min-h-11 md:min-h-9"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCambio(c.id)}
                        className="shrink-0"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="ahorro-meta" className={labelClass}>
                Meta de ahorro (total a reunir)
              </label>
              <Input
                id="ahorro-meta"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={metaStr}
                onChange={(ev) => setMetaStr(ev.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="ahorro-fecha-inicio" className={labelClass}>
                  Fecha de inicio del plan
                </label>
                <Input
                  id="ahorro-fecha-inicio"
                  type="date"
                  value={fechaInicio}
                  onChange={(ev) => setFechaInicio(ev.target.value)}
                  className={fieldClass}
                  required
                />
                {fechaInicio ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Los cortes desde esta fecha cuentan para el arrastre.{" "}
                    {format(parseISO(fechaInicio), "EEEE d MMMM yyyy", {
                      locale: es,
                    })}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="ahorro-fecha" className={labelClass}>
                  Fecha objetivo
                </label>
                <Input
                  id="ahorro-fecha"
                  type="date"
                  value={fecha}
                  onChange={(ev) => setFecha(ev.target.value)}
                  className={fieldClass}
                  required
                />
                {fecha ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(parseISO(fecha), "EEEE d MMMM yyyy", { locale: es })}
                  </p>
                ) : null}
              </div>
            </div>

            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
            {savedHint ? (
              <p className="text-sm font-medium text-primary">
                Cambios guardados y sincronizados.
              </p>
            ) : null}

            <Button
              type="submit"
              className="min-h-11 w-full touch-manipulation sm:w-auto sm:min-h-9"
            >
              Guardar metas
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
