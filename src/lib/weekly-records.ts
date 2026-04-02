import type { IngresoSemanal, WeeklyExpenseRecord } from "@/types/expenses";

function totalOf(r: WeeklyExpenseRecord): number {
  return r.efectivoMinorUnits + r.transferenciaMinorUnits;
}

/**
 * Ordena por fecha y recalcula `totalMinorUnits` y `gastoSemanalMinorUnits`.
 *
 * El gasto de la semana que va de sorted[i-1] a sorted[i] se calcula como:
 *   total[i-1] + ingresos registrados en ese período - total[i]
 *
 * Los ingresos con fechaISO >= sorted[i-1].fechaISO y < sorted[i].fechaISO
 * pertenecen a ese período.
 *
 * Se mantiene compatibilidad con el campo legado `ingresoExtraMinorUnits`
 * (datos anteriores a este sistema); se suma si está presente.
 */
export function recomputeWeeklyRecords(
  records: WeeklyExpenseRecord[],
  ingresos: IngresoSemanal[]
): WeeklyExpenseRecord[] {
  const sorted = [...records].sort((a, b) =>
    a.fechaISO.localeCompare(b.fechaISO)
  );

  return sorted.map((r, i) => {
    const total = r.efectivoMinorUnits + r.transferenciaMinorUnits;

    if (i === 0) {
      return { ...r, totalMinorUnits: total, gastoSemanalMinorUnits: null };
    }

    const prevTotal = totalOf(sorted[i - 1]);
    const prevFechaISO = sorted[i - 1].fechaISO;

    // Ingresos cuya fecha cae en el período [prevFechaISO, r.fechaISO)
    const ingresosDelPeriodo = ingresos
      .filter(
        (ing) => ing.fechaISO >= prevFechaISO && ing.fechaISO < r.fechaISO
      )
      .reduce((sum, ing) => sum + ing.montoMinorUnits, 0);

    // Compat. con dato legado (se conserva hasta que el registro sea re-guardado)
    const legacyExtra = r.ingresoExtraMinorUnits ?? 0;

    const gastoSemanalMinorUnits =
      prevTotal + ingresosDelPeriodo + legacyExtra - total;

    return { ...r, totalMinorUnits: total, gastoSemanalMinorUnits };
  });
}
