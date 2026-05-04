import {
  differenceInCalendarWeeks,
  isValid,
  max,
  parse,
  startOfWeek,
} from "date-fns";

import type { CambioSueldo } from "@/types/ahorro";
import type { WeeklyExpenseRecord } from "@/types/expenses";

export type AhorroProjectionResult = {
  semanasTotales: number;
  /** Semana del plan en curso, primera = 1. */
  semanaActualDelPlan: number;
  /** Sueldos que llegan durante el plan (meses cuyo día 1 cae dentro del período). */
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
 * 1. Contá cuántos sueldos llegan durante el plan: meses cuyo día 1 cae
 *    después de fechaInicio y antes o el día de fechaObjetivo.
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
  cambiosSueldo?: CambioSueldo[];
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

  // Si el objetivo cae en lunes, ese lunes abre una semana nueva que ya está
  // fuera del plan; no se suma +1. Si cae en otro día, se incluye la semana parcial.
  const objetivoEsLunes = objetivoDate.getDay() === 1;
  const semanasTotales = Math.max(
    1,
    differenceInCalendarWeeks(lunesObjetivo, lunesInicio, { weekStartsOn: 1 }) +
      (objetivoEsLunes ? 0 : 1)
  );

  // Para cada mes que cae dentro del plan, aplicamos el sueldo vigente
  // según los cambios registrados. Si no hay cambios, es sueldoActual × meses.
  const { totalIngresos, sueldosCantidad } = calcularIngresos(
    inicioDate,
    objetivoDate,
    sueldoActual,
    input.cambiosSueldo ?? []
  );
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

function calcularIngresos(
  inicioDate: Date,
  objetivoDate: Date,
  sueldoBase: number,
  cambios: CambioSueldo[]
): { totalIngresos: number; sueldosCantidad: number } {
  const sorted = [...cambios].sort((a, b) => a.mesISO.localeCompare(b.mesISO));
  let total = 0;
  let count = 0;
  let year = inicioDate.getFullYear();
  let month0 = inicioDate.getMonth() + 1; // avanza un mes (0-indexed)
  if (month0 > 11) {
    month0 = 0;
    year++;
  }
  while (true) {
    const primero = new Date(year, month0, 1);
    if (primero > objetivoDate) break;
    const mesISO = `${year}-${String(month0 + 1).padStart(2, "0")}`;
    let salario = sueldoBase;
    for (const c of sorted) {
      if (c.mesISO <= mesISO) salario = c.monto;
    }
    total += salario;
    count++;
    month0++;
    if (month0 > 11) {
      month0 = 0;
      year++;
    }
  }
  return { totalIngresos: total, sueldosCantidad: count };
}

function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
