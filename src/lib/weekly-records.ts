import type { WeeklyExpenseRecord } from "@/types/expenses";

function totalOf(r: WeeklyExpenseRecord): number {
  return r.efectivoMinorUnits + r.transferenciaMinorUnits;
}

/** Ordena por fecha y recalcula `totalMinorUnits` y `gastoSemanalMinorUnits` para cada fila. */
export function recomputeWeeklyRecords(
  records: WeeklyExpenseRecord[]
): WeeklyExpenseRecord[] {
  const sorted = [...records].sort((a, b) =>
    a.fechaISO.localeCompare(b.fechaISO)
  );

  return sorted.map((r, i) => {
    const total = r.efectivoMinorUnits + r.transferenciaMinorUnits;
    const extra = r.ingresoExtraMinorUnits ?? 0;
    const prevTotal = i === 0 ? 0 : totalOf(sorted[i - 1]);
    const gastoSemanalMinorUnits =
      i === 0 ? null : prevTotal + extra - total;

    return {
      ...r,
      totalMinorUnits: total,
      gastoSemanalMinorUnits,
    };
  });
}
