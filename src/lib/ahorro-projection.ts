import {
  differenceInCalendarWeeks,
  differenceInMonths,
  isValid,
  max,
  parse,
  startOfWeek,
} from "date-fns";

import type { WeeklyExpenseRecord } from "@/types/expenses";

export type AhorroProjectionResult = {
  semanasTotales: number;
  /** Semana del plan en curso, primera = 1. */
  semanaActualDelPlan: number;
  /** Sueldos completos contados dentro del plan (floor de meses). */
  sueldosCantidad: number;
  /** sueldosCantidad × sueldoActual */
  totalIngresos: number;
  /** (totalIngresos − metaAhorro) / semanasTotales */
  presupuestoBaseSemanal: number;
  ahorroSemanalRequerido: number;
  semanasPasadas: number;
  gastosAcumulados: number;
  saldoArrastre: number;
  presupuestoEstaSemana: number;
};

/**
 * Presupuesto con arrastre:
 *
 * 1. Contá cuántos sueldos completos cobrás entre fechaInicio y fechaObjetivo
 *    (floor de meses, porque el sueldo llega el primer día hábil del mes).
 * 2. Total disponible = sueldos × sueldo − meta.
 * 3. Presupuesto semanal = total disponible / semanas del plan.
 * 4. Arrastre = presupuesto acumulado de semanas cerradas − gasto real registrado.
 */
export function computeAhorroProjection(input: {
  weeklyRecords: WeeklyExpenseRecord[];
  sueldoActual: number;
  metaAhorro: number;
  fechaInicio: string;
  fechaObjetivo: string;
  /** Solo tests: referencia de "hoy" para el arrastre. */
  ahora?: Date;
}): AhorroProjectionResult | null {
  const {
    weeklyRecords,
    sueldoActual,
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

  if (lunesObjetivo < lunesInicio) return null;

  /** Semanas del plan: del lunes de inicio al lunes de la meta, ambas inclusivas. */
  const semanasTotales = Math.max(
    1,
    differenceInCalendarWeeks(lunesObjetivo, lunesInicio, { weekStartsOn: 1 }) + 1
  );

  /**
   * Sueldos completos: floor de meses entre fechaInicio y fechaObjetivo.
   * Ej: 13,3 meses → 13 sueldos (el sueldo llega el primer día hábil del mes,
   * así que el del último mes incompleto no se cuenta).
   */
  const sueldosCantidad = Math.max(0, differenceInMonths(objetivoDate, inicioDate));
  const totalIngresos = sueldosCantidad * sueldoActual;
  const disponible = totalIngresos - metaAhorro;
  const presupuestoBaseSemanal = disponible / semanasTotales;
  const ahorroSemanalRequerido = metaAhorro / semanasTotales;

  /** Referencia de "hoy": avanza si el último registro es futuro (modo simulación). */
  const porRegistro = [...weeklyRecords]
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.fechaISO))
    .sort((a, b) => b.fechaISO.localeCompare(a.fechaISO))[0];
  let refDate = reloj;
  if (porRegistro != null) {
    const dUlt = parse(porRegistro.fechaISO, "yyyy-MM-dd", refParse);
    if (isValid(dUlt)) refDate = max([reloj, dUlt]);
  }
  const lunesActual = startOfWeek(refDate, { weekStartsOn: 1 });

  const diffSemanasPasadas = differenceInCalendarWeeks(
    lunesActual,
    lunesInicio,
    { weekStartsOn: 1 }
  );
  const semanasPasadas = diffSemanasPasadas > 0 ? diffSemanasPasadas : 0;
  const semanaActualDelPlan = Math.max(1, Math.min(semanasPasadas + 1, semanasTotales));

  const inicioISO = formatLocalYMD(lunesInicio);
  const actualISO = formatLocalYMD(lunesActual);

  let gastosAcumulados = 0;
  for (const r of weeklyRecords) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fechaISO)) continue;
    if (r.fechaISO <= inicioISO) continue;
    if (r.fechaISO > actualISO) continue;
    const g = r.gastoSemanalMinorUnits;
    gastosAcumulados += typeof g === "number" && Number.isFinite(g) ? g : 0;
  }

  const saldoArrastre = presupuestoBaseSemanal * semanasPasadas - gastosAcumulados;
  const presupuestoEstaSemana = presupuestoBaseSemanal + saldoArrastre;

  return {
    semanasTotales,
    semanaActualDelPlan,
    sueldosCantidad,
    totalIngresos,
    presupuestoBaseSemanal,
    ahorroSemanalRequerido,
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
