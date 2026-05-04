/**
 * Metas de ahorro. Montos en unidad mínima (centavos), igual que Control semanal.
 * fechaInicio / fechaObjetivo: `yyyy-MM-dd` (límite inclusive donde aplica).
 */

export type CambioSueldo = {
  id: string;
  /** Mes desde el que aplica este sueldo, inclusive. Formato "yyyy-MM". */
  mesISO: string;
  monto: number; // minor units
};

export type AhorroMetasConfig = {
  sueldoActual: number;
  metaAhorro: number;
  /** Lunes (o fecha) que ancla el inicio del plan de presupuesto con arrastre. */
  fechaInicio: string;
  fechaObjetivo: string;
  /** Cambios de sueldo durante el plan. Cada entrada pisa al anterior desde ese mes. */
  cambiosSueldo: CambioSueldo[];
};

export function defaultAhorroMetasConfig(): AhorroMetasConfig {
  return {
    sueldoActual: 0,
    metaAhorro: 0,
    fechaInicio: "",
    fechaObjetivo: "",
    cambiosSueldo: [],
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

  const rawCambios = Array.isArray(o.cambiosSueldo) ? o.cambiosSueldo : [];
  const cambiosSueldo: CambioSueldo[] = rawCambios
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object")
    .map((c) => ({
      id: typeof c.id === "string" ? c.id : crypto.randomUUID(),
      mesISO:
        typeof c.mesISO === "string" && /^\d{4}-\d{2}$/.test(c.mesISO)
          ? c.mesISO
          : "",
      monto: n(c.monto),
    }))
    .filter((c) => c.mesISO !== "");

  return {
    sueldoActual: n(o.sueldoActual),
    metaAhorro: n(o.metaAhorro),
    fechaInicio: fechaOk(o.fechaInicio),
    fechaObjetivo: fechaOk(o.fechaObjetivo),
    cambiosSueldo,
  };
}
