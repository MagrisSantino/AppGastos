import type { MonedaCuota } from "@/types/expenses";

/** Convierte texto de monto a centavos. Acepta miles con punto y decimal con coma (ej. 1.234,56) o US 1234.56. */
export function parseMoneyInputToMinorUnits(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "");
  if (t === "") return null;

  let normalized: string;
  if (/^\d+\.\d{1,2}$/.test(t)) {
    normalized = t;
  } else {
    normalized = t.replace(/\./g, "").replace(",", ".");
  }

  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function minorUnitsToInputString(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function formatMoneyMinorUnits(minor: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function formatCuotaMoney(minorUnits: number, moneda: MonedaCuota): string {
  if (moneda === "USD") {
    const n = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minorUnits / 100);
    return `${n} USD`;
  }
  return formatMoneyMinorUnits(minorUnits);
}

/** Valor mayor ya en USD (no minor units) para ejes de gráficos. */
export function formatUsdMayorCompacto(valor: number): string {
  return `${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valor)} USD`;
}

export function labelMoneda(moneda: MonedaCuota): string {
  return moneda === "USD" ? "USD" : "Pesos";
}
