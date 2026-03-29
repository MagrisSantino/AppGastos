/**
 * Metas de ahorro. Montos en unidad mínima (centavos), igual que Control semanal.
 * fechaInicio / fechaObjetivo: `yyyy-MM-dd` (límite inclusive donde aplica).
 */
export type AhorroMetasConfig = {
  sueldoActual: number;
  gastoFijoMensual: number;
  metaAhorro: number;
  /** Lunes (o fecha) que ancla el inicio del plan de presupuesto con arrastre. */
  fechaInicio: string;
  fechaObjetivo: string;
};

export function defaultAhorroMetasConfig(): AhorroMetasConfig {
  return {
    sueldoActual: 0,
    gastoFijoMensual: 0,
    metaAhorro: 0,
    fechaInicio: "",
    fechaObjetivo: "",
  };
}

/** Normaliza datos persistidos o parciales del formulario. */
export function normalizeAhorroMetasPayload(raw: unknown): AhorroMetasConfig {
  if (!raw || typeof raw !== "object") return defaultAhorroMetasConfig();
  const o = raw as Record<string, unknown>;
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  const fechaOk = (s: unknown) =>
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  return {
    sueldoActual: n(o.sueldoActual),
    gastoFijoMensual: n(o.gastoFijoMensual),
    metaAhorro: n(o.metaAhorro),
    fechaInicio: fechaOk(o.fechaInicio),
    fechaObjetivo: fechaOk(o.fechaObjetivo),
  };
}
