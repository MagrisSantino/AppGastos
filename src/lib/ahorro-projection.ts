import {
  differenceInCalendarWeeks,
  isValid,
  max,
  parse,
  startOfWeek,
} from "date-fns";

import type { WeeklyExpenseRecord } from "@/types/expenses";

const SEMANAS_POR_MES_APROX = 4.333;

export type AhorroProjectionResult = {
  semanasTotales: number;
  /** Semana del plan en curso, primera = 1 (según semanas completas desde el inicio). */
  semanaActualDelPlan: number;
  ahorroSemanalRequerido: number;
  ingresoSemanalLimpio: number;
  presupuestoBaseSemanal: number;
  semanasPasadas: number;
  gastosAcumulados: number;
  saldoArrastre: number;
  presupuestoEstaSemana: number;
};

/**
 * Presupuesto con arrastre (simulación):
 * - Base fija semanal = (sueldo − gasto fijo) / 4,333 − meta / semanas del plan.
 * - Lo podés gastar esta semana = base + arrastre, con arrastre = base×semanas
 *   ya cerradas − gasto registrado en esas semanas (no usa patrimonio total).
 */
export function computeAhorroProjection(input: {
  weeklyRecords: WeeklyExpenseRecord[];
  sueldoActual: number;
  gastoFijoMensual: number;
  metaAhorro: number;
  fechaInicio: string;
  fechaObjetivo: string;
  /** Solo tests; la referencia de “hoy” para el arrastre usa siempre la fecha real del dispositivo. */
  ahora?: Date;
}): AhorroProjectionResult | null {
  const {
    weeklyRecords,
    sueldoActual,
    gastoFijoMensual,
    metaAhorro,
    fechaInicio: fechaInicioRaw,
    fechaObjetivo: fechaObjetivoRaw,
  } = input;
  const reloj = new Date();
  const refParse = input.ahora ?? reloj;

  const fechaInicio = fechaInicioRaw.trim();
  const fechaObjetivo = fechaObjetivoRaw.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fechaObjetivo)
  ) {
    return null;
  }

  const inicioDate = parse(fechaInicio, "yyyy-MM-dd", refParse);
  const objetivoDate = parse(fechaObjetivo, "yyyy-MM-dd", refParse);
  if (!isValid(inicioDate) || !isValid(objetivoDate)) {
    return null;
  }

  const lunesInicio = startOfWeek(inicioDate, { weekStartsOn: 1 });
  const lunesObjetivo = startOfWeek(objetivoDate, { weekStartsOn: 1 });

  /**
   * Avanzar la semana del simulador cuando cargás un corte posterior a “hoy
   * calendario” en el mismo dispositivo; nunca usar una fecha congelada del UI.
   */
  const porRegistro = [...weeklyRecords]
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.fechaISO))
    .sort((a, b) => b.fechaISO.localeCompare(a.fechaISO))[0];
  let refDate = reloj;
  if (porRegistro != null) {
    const dUlt = parse(porRegistro.fechaISO, "yyyy-MM-dd", refParse);
    if (isValid(dUlt)) {
      refDate = max([reloj, dUlt]);
    }
  }
  const lunesActual = startOfWeek(refDate, { weekStartsOn: 1 });

  if (lunesObjetivo < lunesInicio) {
    return null;
  }

  /** Semanas del plan: del lunes de inicio al lunes de la meta, ambas inclusivas. */
  const deltaSemanasInicioMeta = differenceInCalendarWeeks(
    lunesObjetivo,
    lunesInicio,
    { weekStartsOn: 1 }
  );
  const semanasTotales = Math.max(1, deltaSemanasInicioMeta + 1);

  const ahorroSemanalRequerido = metaAhorro / semanasTotales;
  const superavitMensual = sueldoActual - gastoFijoMensual;
  const ingresoSemanalLimpio = superavitMensual / SEMANAS_POR_MES_APROX;
  const presupuestoBaseSemanal = ingresoSemanalLimpio - ahorroSemanalRequerido;

  const diffSemanasPasadas = differenceInCalendarWeeks(
    lunesActual,
    lunesInicio,
    { weekStartsOn: 1 }
  );
  const semanasPasadas =
    diffSemanasPasadas > 0 ? diffSemanasPasadas : 0;

  const semanaActualDelPlan = Math.max(
    1,
    Math.min(semanasPasadas + 1, semanasTotales)
  );

  const inicioISO = formatLocalYMD(lunesInicio);
  const actualISO = formatLocalYMD(lunesActual);

  /**
   * Cada registro es un lunes de corte: `gastoSemanalMinorUnits` es el gasto de
   * la semana que acaba de terminar. Sumamos cortes con lunes > inicio del plan
   * y ≤ lunes de esta semana (así incluimos el corte del lunes actual).
   */
  let gastosAcumulados = 0;
  for (const r of weeklyRecords) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fechaISO)) continue;
    if (r.fechaISO <= inicioISO) continue;
    if (r.fechaISO > actualISO) continue;
    const g = r.gastoSemanalMinorUnits;
    gastosAcumulados += typeof g === "number" && Number.isFinite(g) ? g : 0;
  }

  const saldoArrastre =
    presupuestoBaseSemanal * semanasPasadas - gastosAcumulados;
  const presupuestoEstaSemana = presupuestoBaseSemanal + saldoArrastre;

  return {
    semanasTotales,
    semanaActualDelPlan,
    ahorroSemanalRequerido,
    ingresoSemanalLimpio,
    presupuestoBaseSemanal,
    semanasPasadas,
    gastosAcumulados,
    saldoArrastre,
    presupuestoEstaSemana,
  };
}

function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
