import { addMonths, format, isBefore, parseISO, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

import type {
  InstallmentPurchase,
  MonedaCuota,
  TarjetaCredito,
} from "@/types/expenses";

export type ResumenTarjetaMes = {
  tarjetaId: string | null;
  moneda: MonedaCuota;
  etiqueta: string;
  montoMinor: number;
};

export type LineaDetalleCuotaMes = {
  id: string;
  descripcion: string;
  montoMinorUnits: number;
  /** Cuota actual (1-based). */
  indiceCuota: number;
  numeroCuotas: number;
};

/** Compras que aportan cuota en ese mes para esa tarjeta (o sin tarjeta) y moneda. */
export function detalleLineasCuotaMesPorTarjeta(
  compras: InstallmentPurchase[],
  mesISO: string,
  tarjetaId: string | null,
  moneda: MonedaCuota
): LineaDetalleCuotaMes[] {
  const out: LineaDetalleCuotaMes[] = [];
  for (const p of compras) {
    if (monedaDeCompra(p) !== moneda) continue;
    if ((p.tarjetaId ?? null) !== tarjetaId) continue;
    for (let k = 0; k < p.numeroCuotas; k++) {
      const m = format(addMonths(mesInicioDate(p.inicioMesISO), k), "yyyy-MM");
      if (m === mesISO) {
        out.push({
          id: p.id,
          descripcion: p.descripcion,
          montoMinorUnits: p.cuotaMinorUnits,
          indiceCuota: k + 1,
          numeroCuotas: p.numeroCuotas,
        });
        break;
      }
    }
  }
  out.sort(
    (a, b) =>
      b.montoMinorUnits - a.montoMinorUnits ||
      a.descripcion.localeCompare(b.descripcion)
  );
  return out;
}

export function mesInicioDate(inicioMesISO: string): Date {
  return startOfMonth(parseISO(`${inicioMesISO}-01`));
}

export function cuotaMinorUnitsFromTotal(
  totalMinorUnits: number,
  numeroCuotas: number
): number {
  if (numeroCuotas < 1) return 0;
  return Math.round(totalMinorUnits / numeroCuotas);
}

/** Último mes con cuota (mismo formato `yyyy-MM` que el inicio). */
export function ultimoMesPagoISO(
  inicioMesISO: string,
  numeroCuotas: number
): string {
  const d = addMonths(mesInicioDate(inicioMesISO), Math.max(0, numeroCuotas - 1));
  return format(d, "yyyy-MM");
}

export function estadoCompra(
  p: InstallmentPurchase,
  ahora = new Date()
): "Activa" | "Finalizada" {
  const ultimoMes = startOfMonth(
    addMonths(mesInicioDate(p.inicioMesISO), p.numeroCuotas - 1)
  );
  const esteMes = startOfMonth(ahora);
  return isBefore(ultimoMes, esteMes) ? "Finalizada" : "Activa";
}

function monedaDeCompra(p: InstallmentPurchase): MonedaCuota {
  return p.moneda === "USD" ? "USD" : "CLP";
}

/** Totales del mes por moneda (no mezcla CLP con USD). */
export function sumaCuotasEnMesPorMoneda(
  compras: InstallmentPurchase[],
  mesISO: string
): Record<MonedaCuota, number> {
  const acc: Record<MonedaCuota, number> = { CLP: 0, USD: 0 };
  for (const p of compras) {
    const moneda = monedaDeCompra(p);
    for (let k = 0; k < p.numeroCuotas; k++) {
      const m = format(addMonths(mesInicioDate(p.inicioMesISO), k), "yyyy-MM");
      if (m === mesISO) acc[moneda] += p.cuotaMinorUnits;
    }
  }
  return acc;
}

/** Suma de cuotas del mes por tarjeta y moneda. */
export function resumenPagosPorTarjetaEnMes(
  compras: InstallmentPurchase[],
  tarjetas: TarjetaCredito[],
  mesISO: string
): ResumenTarjetaMes[] {
  const nombrePorId = new Map(tarjetas.map((t) => [t.id, t.nombre]));
  const acum = new Map<string, number>();

  for (const p of compras) {
    const moneda = monedaDeCompra(p);
    for (let k = 0; k < p.numeroCuotas; k++) {
      const m = format(addMonths(mesInicioDate(p.inicioMesISO), k), "yyyy-MM");
      if (m !== mesISO) continue;
      const tid = p.tarjetaId ?? null;
      const key = `${tid ?? "none"}::${moneda}`;
      acum.set(key, (acum.get(key) ?? 0) + p.cuotaMinorUnits);
    }
  }

  const rows: ResumenTarjetaMes[] = [];
  for (const [key, montoMinor] of acum) {
    if (montoMinor === 0) continue;
    const [tidPart, monedaPart] = key.split("::");
    const moneda = monedaPart === "USD" ? "USD" : "CLP";
    const tid = tidPart === "none" ? null : tidPart;
    let etiqueta: string;
    if (tid == null) {
      etiqueta = "Sin tarjeta";
    } else if (nombrePorId.has(tid)) {
      etiqueta = nombrePorId.get(tid)!;
    } else {
      etiqueta = "Tarjeta (ya no existe)";
    }
    rows.push({ tarjetaId: tid, moneda, etiqueta, montoMinor });
  }
  rows.sort((a, b) => b.montoMinor - a.montoMinor);
  return rows;
}

export type MesProyeccion = {
  mesISO: string;
  etiqueta: string;
  montoMinorCLP: number;
  montoMinorUSD: number;
};

/** Incluye el mes actual y los 5 siguientes (6 barras). */
export function proyeccionSeisMeses(
  compras: InstallmentPurchase[],
  desde: Date = new Date()
): MesProyeccion[] {
  const base = startOfMonth(desde);
  const rows: MesProyeccion[] = [];
  for (let i = 0; i < 6; i++) {
    const d = addMonths(base, i);
    const mesISO = format(d, "yyyy-MM");
    const porMon = sumaCuotasEnMesPorMoneda(compras, mesISO);
    rows.push({
      mesISO,
      etiqueta: format(d, "MMM yy", { locale: es }),
      montoMinorCLP: porMon.CLP,
      montoMinorUSD: porMon.USD,
    });
  }
  return rows;
}

/** Normaliza datos persistidos (modelo nuevo o legado con `primerVencimientoISO`). */
export function normalizeInstallmentPurchase(
  raw: unknown
): InstallmentPurchase | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const id = typeof o.id === "string" ? o.id : crypto.randomUUID();
  const descripcion =
    typeof o.descripcion === "string" ? o.descripcion.trim() : "";
  const totalMinorUnits =
    typeof o.totalMinorUnits === "number" ? o.totalMinorUnits : 0;
  const numeroCuotas =
    typeof o.numeroCuotas === "number" ? Math.floor(o.numeroCuotas) : 0;

  let inicioMesISO: string | undefined;
  if (
    typeof o.inicioMesISO === "string" &&
    /^\d{4}-\d{2}$/.test(o.inicioMesISO)
  ) {
    inicioMesISO = o.inicioMesISO;
  }
  if (!inicioMesISO && typeof o.primerVencimientoISO === "string") {
    try {
      inicioMesISO = format(
        startOfMonth(parseISO(o.primerVencimientoISO)),
        "yyyy-MM"
      );
    } catch {
      return null;
    }
  }

  if (
    !inicioMesISO ||
    descripcion.length === 0 ||
    numeroCuotas < 1 ||
    totalMinorUnits < 1
  ) {
    return null;
  }

  const cuotaMinorUnits =
    typeof o.cuotaMinorUnits === "number" && o.cuotaMinorUnits > 0
      ? o.cuotaMinorUnits
      : cuotaMinorUnitsFromTotal(totalMinorUnits, numeroCuotas);

  const creadoEn =
    typeof o.creadoEn === "string" ? o.creadoEn : new Date().toISOString();

  let tarjetaId: string | null = null;
  if (typeof o.tarjetaId === "string" && o.tarjetaId.length > 0) {
    tarjetaId = o.tarjetaId;
  }

  const moneda: MonedaCuota =
    o.moneda === "USD" ? "USD" : "CLP";

  return {
    id,
    descripcion,
    totalMinorUnits,
    numeroCuotas,
    cuotaMinorUnits,
    inicioMesISO,
    tarjetaId,
    moneda,
    creadoEn,
  };
}

export function normalizeTarjetaCredito(raw: unknown): TarjetaCredito | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const nombre = typeof o.nombre === "string" ? o.nombre.trim() : "";
  if (!id || !nombre) return null;
  return {
    id,
    nombre,
    creadoEn:
      typeof o.creadoEn === "string" ? o.creadoEn : new Date().toISOString(),
  };
}
