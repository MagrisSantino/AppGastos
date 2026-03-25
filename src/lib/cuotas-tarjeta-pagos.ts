import { addMonths, format, parseISO, startOfMonth } from "date-fns";

import { mesInicioDate, resumenPagosPorTarjetaEnMes } from "@/lib/installments";
import type { InstallmentPurchase, MonedaCuota, TarjetaCredito } from "@/types/expenses";

export function pagoTarjetaMesKey(
  mesISO: string,
  tarjetaId: string | null,
  moneda: MonedaCuota
): string {
  return `${mesISO}::${tarjetaId ?? "none"}::${moneda}`;
}

export function isPagoTarjetaMesMarcado(
  keys: readonly string[],
  mesISO: string,
  tarjetaId: string | null,
  moneda: MonedaCuota
): boolean {
  return keys.includes(pagoTarjetaMesKey(mesISO, tarjetaId, moneda));
}

export function mesTodasCuotasTarjetaPagadas(
  compras: InstallmentPurchase[],
  tarjetas: TarjetaCredito[],
  mesISO: string,
  keysPagados: readonly string[]
): boolean {
  const rows = resumenPagosPorTarjetaEnMes(compras, tarjetas, mesISO);
  if (rows.length === 0) return false;
  return rows.every((r) =>
    isPagoTarjetaMesMarcado(keysPagados, mesISO, r.tarjetaId, r.moneda)
  );
}

/** Mes a mostrar en el recuadro «por tarjeta»: avanza si el mes calendario ya está todo pagado. */
export function resolverMesVistaTarjetas(
  compras: InstallmentPurchase[],
  tarjetas: TarjetaCredito[],
  ahora: Date,
  keysPagados: readonly string[]
): string {
  let mes = format(startOfMonth(ahora), "yyyy-MM");
  for (let i = 0; i < 36; i++) {
    const rows = resumenPagosPorTarjetaEnMes(compras, tarjetas, mes);
    if (rows.length === 0) {
      return mes;
    }
    const todo = rows.every((r) =>
      isPagoTarjetaMesMarcado(keysPagados, mes, r.tarjetaId, r.moneda)
    );
    if (!todo) {
      return mes;
    }
    mes = format(addMonths(parseISO(`${mes}-01`), 1), "yyyy-MM");
  }
  return mes;
}

export function vistaEsMesSiguienteAlCalendario(
  mesVistaISO: string,
  ahora: Date
): boolean {
  const mesEste = format(startOfMonth(ahora), "yyyy-MM");
  return mesVistaISO !== mesEste;
}

/**
 * Devuelve true si **todos** los meses de cuota de esta compra están marcados
 * como pagados (para su tarjeta y moneda).
 */
export function compraTodaPagada(
  compra: InstallmentPurchase,
  keysPagados: readonly string[]
): boolean {
  const moneda: MonedaCuota = compra.moneda === "USD" ? "USD" : "CLP";
  const tid = compra.tarjetaId ?? null;
  const base = mesInicioDate(compra.inicioMesISO);
  for (let k = 0; k < compra.numeroCuotas; k++) {
    const mesISO = format(addMonths(base, k), "yyyy-MM");
    if (!isPagoTarjetaMesMarcado(keysPagados, mesISO, tid, moneda)) {
      return false;
    }
  }
  return true;
}
