/** Registro del control semanal (corte cada lunes). */
export interface WeeklyExpenseRecord {
  id: string;
  /** Fecha del lunes de corte (ISO `yyyy-MM-dd`). */
  fechaISO: string;
  /** Efectivo disponible en unidad mínima (centavos). */
  efectivoMinorUnits: number;
  /** Transferencia / bancos en unidad mínima. */
  transferenciaMinorUnits: number;
  /**
   * Ingresos extra recibidos durante la semana que terminó (la semana anterior a esta fecha).
   * Opcional; null = 0 en el cálculo.
   */
  ingresoExtraMinorUnits: number | null;
  /** efectivo + transferencia (denormalizado al guardar). */
  totalMinorUnits: number;
  /**
   * Gasto de la semana anterior:
   * (total semana anterior + ingreso extra de ESTE registro) - total actual.
   */
  gastoSemanalMinorUnits: number | null;
  creadoEn: string;
}

/** Tarjeta de crédito registrada por el usuario. */
export interface TarjetaCredito {
  id: string;
  nombre: string;
  creadoEn: string;
}

/** Moneda de la compra en cuotas (montos en centavos / centavos de dólar). */
export type MonedaCuota = "CLP" | "USD";

/** Compra financiada en cuotas fijas (mismo monto cada mes). */
export interface InstallmentPurchase {
  id: string;
  descripcion: string;
  /** Monto total en unidad mínima (centavos). */
  totalMinorUnits: number;
  numeroCuotas: number;
  /** Monto por cuota (redondeado; derivado de total / cuotas). */
  cuotaMinorUnits: number;
  /** Primer mes de pago `yyyy-MM`. */
  inicioMesISO: string;
  /** Tarjeta con la que pagás esta compra; null = sin asignar. */
  tarjetaId: string | null;
  /** Compras viejas sin campo se normalizan a CLP. */
  moneda: MonedaCuota;
  creadoEn: string;
}
