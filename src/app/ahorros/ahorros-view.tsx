"use client";

import * as React from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { PiggyBank } from "lucide-react";

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
import type { AhorroMetasConfig } from "@/types/ahorro";

export function AhorrosView() {
  const isLoading = useExpenseStore((s) => s.isLoading);
  const ahorroMetas = useExpenseStore((s) => s.ahorroMetas);
  const setAhorroMetas = useExpenseStore((s) => s.setAhorroMetas);

  const [sueldoStr, setSueldoStr] = React.useState("");
  const [metaStr, setMetaStr] = React.useState("");
  const [fechaInicio, setFechaInicio] = React.useState("");
  const [fecha, setFecha] = React.useState("");
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
  }, [ahorroMetas]);

  const fieldClass =
    "min-h-11 w-full text-base md:min-h-9 md:text-sm touch-manipulation";
  const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

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

    const payload: AhorroMetasConfig = {
      sueldoActual: sueldo,
      metaAhorro: meta,
      fechaInicio: fechaInicio.trim(),
      fechaObjetivo: fecha.trim(),
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

      <Card className="max-w-xl border-border shadow-sm">
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
