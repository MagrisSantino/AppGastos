import { getSupabase } from "./supabase";
import type {
  InstallmentPurchase,
  MonedaCuota,
  TarjetaCredito,
  WeeklyExpenseRecord,
} from "@/types/expenses";

/* ------------------------------------------------------------------ */
/*  Row types (snake_case — match the Supabase / PostgreSQL columns)  */
/* ------------------------------------------------------------------ */

type WeeklyRecordRow = {
  id: string;
  fecha_iso: string;
  efectivo_minor_units: number;
  transferencia_minor_units: number;
  ingreso_extra_minor_units: number | null;
  total_minor_units: number;
  gasto_semanal_minor_units: number | null;
  creado_en: string;
};

type InstallmentRow = {
  id: string;
  descripcion: string;
  total_minor_units: number;
  numero_cuotas: number;
  cuota_minor_units: number;
  inicio_mes_iso: string;
  tarjeta_id: string | null;
  moneda: string;
  creado_en: string;
};

type TarjetaRow = {
  id: string;
  nombre: string;
  creado_en: string;
};

/* ------------------------------------------------------------------ */
/*  Mappers  DB row <-> App type                                      */
/* ------------------------------------------------------------------ */

function toWeeklyRecord(row: WeeklyRecordRow): WeeklyExpenseRecord {
  return {
    id: row.id,
    fechaISO: row.fecha_iso,
    efectivoMinorUnits: row.efectivo_minor_units,
    transferenciaMinorUnits: row.transferencia_minor_units,
    ingresoExtraMinorUnits: row.ingreso_extra_minor_units,
    totalMinorUnits: row.total_minor_units,
    gastoSemanalMinorUnits: row.gasto_semanal_minor_units,
    creadoEn: row.creado_en,
  };
}

function fromWeeklyRecord(r: WeeklyExpenseRecord): WeeklyRecordRow {
  return {
    id: r.id,
    fecha_iso: r.fechaISO,
    efectivo_minor_units: r.efectivoMinorUnits,
    transferencia_minor_units: r.transferenciaMinorUnits,
    ingreso_extra_minor_units: r.ingresoExtraMinorUnits,
    total_minor_units: r.totalMinorUnits,
    gasto_semanal_minor_units: r.gastoSemanalMinorUnits,
    creado_en: r.creadoEn,
  };
}

function toInstallment(row: InstallmentRow): InstallmentPurchase {
  return {
    id: row.id,
    descripcion: row.descripcion,
    totalMinorUnits: row.total_minor_units,
    numeroCuotas: row.numero_cuotas,
    cuotaMinorUnits: row.cuota_minor_units,
    inicioMesISO: row.inicio_mes_iso,
    tarjetaId: row.tarjeta_id,
    moneda: (row.moneda === "USD" ? "USD" : "CLP") as MonedaCuota,
    creadoEn: row.creado_en,
  };
}

function fromInstallment(p: InstallmentPurchase): InstallmentRow {
  return {
    id: p.id,
    descripcion: p.descripcion,
    total_minor_units: p.totalMinorUnits,
    numero_cuotas: p.numeroCuotas,
    cuota_minor_units: p.cuotaMinorUnits,
    inicio_mes_iso: p.inicioMesISO,
    tarjeta_id: p.tarjetaId,
    moneda: p.moneda,
    creado_en: p.creadoEn,
  };
}

function toTarjeta(row: TarjetaRow): TarjetaCredito {
  return { id: row.id, nombre: row.nombre, creadoEn: row.creado_en };
}

function fromTarjeta(t: TarjetaCredito): TarjetaRow {
  return { id: t.id, nombre: t.nombre, creado_en: t.creadoEn };
}

/* ------------------------------------------------------------------ */
/*  Fetch all data                                                    */
/* ------------------------------------------------------------------ */

export type SupabaseSnapshot = {
  weeklyRecords: WeeklyExpenseRecord[];
  installmentPurchases: InstallmentPurchase[];
  tarjetas: TarjetaCredito[];
  cuotasTarjetaPagadasKeys: string[];
  tipoCambioPesosPorUsd: number;
  hasData: boolean;
};

export async function fetchAllData(): Promise<SupabaseSnapshot> {
  const sb = getSupabase();

  const [weeklyRes, installRes, tarjetasRes, keysRes, settingsRes] =
    await Promise.all([
      sb.from("weekly_records").select("*").order("fecha_iso"),
      sb.from("installment_purchases").select("*").order("creado_en"),
      sb.from("tarjetas").select("*").order("creado_en"),
      sb.from("cuotas_pagadas_keys").select("key"),
      sb.from("settings").select("*"),
    ]);

  if (weeklyRes.error) console.error("weekly_records:", weeklyRes.error);
  if (installRes.error) console.error("installment_purchases:", installRes.error);
  if (tarjetasRes.error) console.error("tarjetas:", tarjetasRes.error);
  if (keysRes.error) console.error("cuotas_pagadas_keys:", keysRes.error);
  if (settingsRes.error) console.error("settings:", settingsRes.error);

  const weeklyRecords = (weeklyRes.data ?? []).map(
    (r) => toWeeklyRecord(r as WeeklyRecordRow),
  );
  const installmentPurchases = (installRes.data ?? []).map(
    (r) => toInstallment(r as InstallmentRow),
  );
  const tarjetas = (tarjetasRes.data ?? []).map(
    (r) => toTarjeta(r as TarjetaRow),
  );
  const cuotasTarjetaPagadasKeys = (keysRes.data ?? []).map(
    (r: { key: string }) => r.key,
  );

  let tipoCambioPesosPorUsd = 1450;
  const tcRow = (settingsRes.data ?? []).find(
    (r: { key: string }) => r.key === "tipoCambioPesosPorUsd",
  ) as { key: string; value: string } | undefined;
  if (tcRow) {
    const v = Number(tcRow.value);
    if (Number.isFinite(v) && v > 0) tipoCambioPesosPorUsd = v;
  }

  const hasData =
    weeklyRecords.length > 0 ||
    installmentPurchases.length > 0 ||
    tarjetas.length > 0;

  return {
    weeklyRecords,
    installmentPurchases,
    tarjetas,
    cuotasTarjetaPagadasKeys,
    tipoCambioPesosPorUsd,
    hasData,
  };
}

/** Snapshot para migración / merge local → Supabase (respeta orden FK). */
export type PersistedExpenseSnapshot = {
  weeklyRecords: WeeklyExpenseRecord[];
  installmentPurchases: InstallmentPurchase[];
  tarjetas: TarjetaCredito[];
  cuotasTarjetaPagadasKeys: string[];
  tipoCambioPesosPorUsd: number;
};

/**
 * Sube un snapshot completo y devuelve error si Supabase rechaza alguna operación.
 * Orden: tarjetas → semanales → cuotas (FK a tarjetas).
 */
export async function pushPersistedSnapshotToSupabase(
  snapshot: PersistedExpenseSnapshot
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sb = getSupabase();
    const errParts: string[] = [];

    if (snapshot.tarjetas.length > 0) {
      const { error } = await sb
        .from("tarjetas")
        .upsert(snapshot.tarjetas.map(fromTarjeta), { onConflict: "id" });
      if (error) errParts.push(`tarjetas: ${error.message}`);
    }

    if (snapshot.weeklyRecords.length > 0) {
      const { error } = await sb
        .from("weekly_records")
        .upsert(snapshot.weeklyRecords.map(fromWeeklyRecord), {
          onConflict: "id",
        });
      if (error) errParts.push(`weekly_records: ${error.message}`);
    }

    if (snapshot.installmentPurchases.length > 0) {
      const { error } = await sb
        .from("installment_purchases")
        .upsert(snapshot.installmentPurchases.map(fromInstallment), {
          onConflict: "id",
        });
      if (error) errParts.push(`installment_purchases: ${error.message}`);
    }

    if (snapshot.cuotasTarjetaPagadasKeys.length > 0) {
      const { error } = await sb
        .from("cuotas_pagadas_keys")
        .upsert(
          snapshot.cuotasTarjetaPagadasKeys.map((key) => ({ key })),
          { onConflict: "key" },
        );
      if (error) errParts.push(`cuotas_pagadas_keys: ${error.message}`);
    }

    if (snapshot.tipoCambioPesosPorUsd !== 1450) {
      const { error } = await sb.from("settings").upsert(
        {
          key: "tipoCambioPesosPorUsd",
          value: String(snapshot.tipoCambioPesosPorUsd),
        },
        { onConflict: "key" },
      );
      if (error) errParts.push(`settings: ${error.message}`);
    }

    if (errParts.length > 0) {
      return { ok: false, error: errParts.join(" · ") };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Write helpers (fire-and-forget — errors are logged, not thrown)    */
/* ------------------------------------------------------------------ */

export async function upsertWeeklyRecords(records: WeeklyExpenseRecord[]) {
  if (records.length === 0) return;
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("weekly_records")
      .upsert(records.map(fromWeeklyRecord), { onConflict: "id" });
    if (error) console.error("upsertWeeklyRecords:", error);
  } catch (err) {
    console.error("upsertWeeklyRecords:", err);
  }
}

export async function deleteWeeklyRecord(id: string) {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("weekly_records").delete().eq("id", id);
    if (error) console.error("deleteWeeklyRecord:", error);
  } catch (err) {
    console.error("deleteWeeklyRecord:", err);
  }
}

export async function upsertInstallmentPurchase(p: InstallmentPurchase) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("installment_purchases")
      .upsert(fromInstallment(p), { onConflict: "id" });
    if (error) console.error("upsertInstallmentPurchase:", error);
  } catch (err) {
    console.error("upsertInstallmentPurchase:", err);
  }
}

export async function upsertInstallmentPurchases(ps: InstallmentPurchase[]) {
  if (ps.length === 0) return;
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("installment_purchases")
      .upsert(ps.map(fromInstallment), { onConflict: "id" });
    if (error) console.error("upsertInstallmentPurchases:", error);
  } catch (err) {
    console.error("upsertInstallmentPurchases:", err);
  }
}

export async function upsertTarjeta(t: TarjetaCredito) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("tarjetas")
      .upsert(fromTarjeta(t), { onConflict: "id" });
    if (error) console.error("upsertTarjeta:", error);
  } catch (err) {
    console.error("upsertTarjeta:", err);
  }
}

export async function upsertTarjetas(ts: TarjetaCredito[]) {
  if (ts.length === 0) return;
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("tarjetas")
      .upsert(ts.map(fromTarjeta), { onConflict: "id" });
    if (error) console.error("upsertTarjetas:", error);
  } catch (err) {
    console.error("upsertTarjetas:", err);
  }
}

export async function deleteTarjeta(id: string) {
  try {
    const sb = getSupabase();
    const { error } = await sb.from("tarjetas").delete().eq("id", id);
    if (error) console.error("deleteTarjeta:", error);
  } catch (err) {
    console.error("deleteTarjeta:", err);
  }
}

export async function insertPagadaKey(key: string) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("cuotas_pagadas_keys")
      .upsert({ key }, { onConflict: "key" });
    if (error) console.error("insertPagadaKey:", error);
  } catch (err) {
    console.error("insertPagadaKey:", err);
  }
}

export async function deletePagadaKey(key: string) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("cuotas_pagadas_keys")
      .delete()
      .eq("key", key);
    if (error) console.error("deletePagadaKey:", error);
  } catch (err) {
    console.error("deletePagadaKey:", err);
  }
}

export async function upsertPagadasKeys(keys: string[]) {
  if (keys.length === 0) return;
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("cuotas_pagadas_keys")
      .upsert(
        keys.map((k) => ({ key: k })),
        { onConflict: "key" },
      );
    if (error) console.error("upsertPagadasKeys:", error);
  } catch (err) {
    console.error("upsertPagadasKeys:", err);
  }
}

export async function upsertSetting(key: string, value: string) {
  try {
    const sb = getSupabase();
    const { error } = await sb
      .from("settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) console.error("upsertSetting:", error);
  } catch (err) {
    console.error("upsertSetting:", err);
  }
}
