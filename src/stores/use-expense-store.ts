import { format, startOfMonth } from "date-fns";
import { create } from "zustand";

import { pagoTarjetaMesKey } from "@/lib/cuotas-tarjeta-pagos";
import {
  cuotaMinorUnitsFromTotal,
  normalizeInstallmentPurchase,
  normalizeTarjetaCredito,
} from "@/lib/installments";
import {
  deleteWeeklyRecord as dbDeleteWeekly,
  deletePagadaKey,
  deleteTarjeta as dbDeleteTarjeta,
  fetchAllData,
  insertPagadaKey,
  type PersistedExpenseSnapshot,
  pushPersistedSnapshotToSupabase,
  upsertInstallmentPurchase as dbUpsertInstallment,
  upsertInstallmentPurchases as dbUpsertInstallments,
  upsertSetting,
  upsertTarjeta as dbUpsertTarjeta,
  upsertTarjetas as dbUpsertTarjetas,
  upsertWeeklyRecords as dbUpsertWeekly,
} from "@/lib/supabase-sync";
import { recomputeWeeklyRecords } from "@/lib/weekly-records";
import {
  defaultAhorroMetasConfig,
  normalizeAhorroMetasPayload,
  type AhorroMetasConfig,
} from "@/types/ahorro";
import type {
  InstallmentPurchase,
  MonedaCuota,
  TarjetaCredito,
  WeeklyExpenseRecord,
} from "@/types/expenses";

const OLD_STORAGE_KEY = "control-gastos:store-v2";
/** Copia de seguridad antes de borrar la clave principal (por si falla algo después). */
const OLD_STORAGE_BACKUP_KEY = "control-gastos:store-v2.bak";

function mesCuotasVistaInicial(): string {
  return format(startOfMonth(new Date()), "yyyy-MM");
}

type SaveWeeklySnapshotInput = {
  fechaISO: string;
  efectivoMinorUnits: number;
  transferenciaMinorUnits: number;
  ingresoExtraMinorUnits: number | null;
};

type AddInstallmentInput = {
  descripcion: string;
  totalMinorUnits: number;
  numeroCuotas: number;
  inicioMesISO: string;
  tarjetaId: string | null;
  moneda: MonedaCuota;
};

type ExpenseStoreState = {
  weeklyRecords: WeeklyExpenseRecord[];
  installmentPurchases: InstallmentPurchase[];
  tarjetas: TarjetaCredito[];
  cuotasTarjetaPagadasKeys: string[];
  tipoCambioPesosPorUsd: number;
  mesCuotasVistaISO: string;
  isLoading: boolean;
  /** Si la subida a Supabase falló al iniciar, el mensaje se muestra y los datos siguen en memoria. */
  cloudSyncError: string | null;

  _init: () => Promise<void>;
  retrySyncToCloud: () => Promise<void>;
  clearCloudSyncError: () => void;
  setWeeklyRecords: (records: WeeklyExpenseRecord[]) => void;
  setInstallmentPurchases: (items: InstallmentPurchase[]) => void;
  setTarjetas: (items: TarjetaCredito[]) => void;
  saveWeeklySnapshot: (input: SaveWeeklySnapshotInput) => void;
  deleteWeeklyRecordById: (id: string) => void;
  addInstallmentPurchase: (input: AddInstallmentInput) => void;
  updateInstallmentPurchase: (id: string, input: AddInstallmentInput) => void;
  addTarjeta: (nombre: string) => void;
  removeTarjeta: (id: string) => void;
  setInstallmentTarjetaId: (
    installmentId: string,
    tarjetaId: string | null
  ) => void;
  togglePagoTarjetaMes: (
    mesISO: string,
    tarjetaId: string | null,
    moneda: MonedaCuota
  ) => void;
  setTipoCambioPesosPorUsd: (valor: number) => void;
  setMesCuotasVistaISO: (mesISO: string) => void;
  ahorroMetas: AhorroMetasConfig;
  setAhorroMetas: (config: AhorroMetasConfig) => void;
};

let _initStarted = false;

export const useExpenseStore = create<ExpenseStoreState>()((set, get) => ({
  weeklyRecords: [],
  installmentPurchases: [],
  tarjetas: [],
  cuotasTarjetaPagadasKeys: [],
  tipoCambioPesosPorUsd: 1450,
  mesCuotasVistaISO: mesCuotasVistaInicial(),
  isLoading: true,
  cloudSyncError: null,
  ahorroMetas: defaultAhorroMetasConfig(),

  /* ---------------------------------------------------------------- */
  /*  Init: Supabase + migración / merge desde localStorage           */
  /* ---------------------------------------------------------------- */
  _init: async () => {
    if (_initStarted) return;
    _initStarted = true;

    try {
      const data = await fetchAllData();
      let localParsed = parseLocalStorageSnapshot();

      if (
        !localParsed &&
        typeof window !== "undefined" &&
        !data.hasData
      ) {
        const bak = localStorage.getItem(OLD_STORAGE_BACKUP_KEY);
        if (bak) {
          try {
            localStorage.setItem(OLD_STORAGE_KEY, bak);
            localParsed = parseLocalStorageSnapshot();
          } catch (e) {
            console.error("No se pudo restaurar desde .bak:", e);
          }
        }
      }

      if (
        localParsed &&
        snapshotHasUserData(localParsed.snapshot)
      ) {
        const push = await pushPersistedSnapshotToSupabase(
          localParsed.snapshot
        );
        if (push.ok) {
          try {
            localStorage.setItem(OLD_STORAGE_BACKUP_KEY, localParsed.raw);
          } catch {
            /* ignorar cuota de almacenamiento */
          }
          localStorage.removeItem(OLD_STORAGE_KEY);
          const fresh = await fetchAllData();
          set({
            weeklyRecords: recomputeWeeklyRecords(fresh.weeklyRecords),
            installmentPurchases: fresh.installmentPurchases
              .map(normalizeInstallmentPurchase)
              .filter((x): x is InstallmentPurchase => x != null),
            tarjetas: fresh.tarjetas
              .map(normalizeTarjetaCredito)
              .filter((x): x is TarjetaCredito => x != null),
            cuotasTarjetaPagadasKeys: fresh.cuotasTarjetaPagadasKeys,
            tipoCambioPesosPorUsd: fresh.tipoCambioPesosPorUsd,
            ahorroMetas: fresh.ahorroMetas,
            cloudSyncError: null,
            isLoading: false,
          });
          return;
        }
        console.error("No se pudo guardar en Supabase:", push.error);
        set({
          weeklyRecords: recomputeWeeklyRecords(
            localParsed.snapshot.weeklyRecords
          ),
          installmentPurchases: localParsed.snapshot.installmentPurchases
            .map(normalizeInstallmentPurchase)
            .filter((x): x is InstallmentPurchase => x != null),
          tarjetas: localParsed.snapshot.tarjetas
            .map(normalizeTarjetaCredito)
            .filter((x): x is TarjetaCredito => x != null),
          cuotasTarjetaPagadasKeys:
            localParsed.snapshot.cuotasTarjetaPagadasKeys,
          tipoCambioPesosPorUsd: localParsed.snapshot.tipoCambioPesosPorUsd,
          ahorroMetas: localParsed.snapshot.ahorroMetas,
          cloudSyncError: `No se pudieron subir los datos a la nube. Seguís viendo lo guardado en este navegador. ${push.error}`,
          isLoading: false,
        });
        return;
      }

      set({
        weeklyRecords: recomputeWeeklyRecords(data.weeklyRecords),
        installmentPurchases: data.installmentPurchases
          .map(normalizeInstallmentPurchase)
          .filter((x): x is InstallmentPurchase => x != null),
        tarjetas: data.tarjetas
          .map(normalizeTarjetaCredito)
          .filter((x): x is TarjetaCredito => x != null),
        cuotasTarjetaPagadasKeys: data.cuotasTarjetaPagadasKeys,
        tipoCambioPesosPorUsd: data.tipoCambioPesosPorUsd,
        ahorroMetas: data.ahorroMetas,
        cloudSyncError: null,
        isLoading: false,
      });
    } catch (err) {
      console.error("Error al cargar datos de Supabase:", err);
      const fallback = parseLocalStorageSnapshot();
      if (fallback && snapshotHasUserData(fallback.snapshot)) {
        set({
          weeklyRecords: recomputeWeeklyRecords(
            fallback.snapshot.weeklyRecords
          ),
          installmentPurchases: fallback.snapshot.installmentPurchases
            .map(normalizeInstallmentPurchase)
            .filter((x): x is InstallmentPurchase => x != null),
          tarjetas: fallback.snapshot.tarjetas
            .map(normalizeTarjetaCredito)
            .filter((x): x is TarjetaCredito => x != null),
          cuotasTarjetaPagadasKeys:
            fallback.snapshot.cuotasTarjetaPagadasKeys,
          tipoCambioPesosPorUsd: fallback.snapshot.tipoCambioPesosPorUsd,
          ahorroMetas: fallback.snapshot.ahorroMetas,
          cloudSyncError:
            "No se pudo conectar con Supabase. Mostrando datos locales si existían.",
          isLoading: false,
        });
      } else {
        set({
          isLoading: false,
          cloudSyncError: null,
          ahorroMetas: defaultAhorroMetasConfig(),
        });
      }
    }
  },

  retrySyncToCloud: async () => {
    const s = get();
    const snapshot: PersistedExpenseSnapshot = {
      weeklyRecords: s.weeklyRecords,
      installmentPurchases: s.installmentPurchases,
      tarjetas: s.tarjetas,
      cuotasTarjetaPagadasKeys: s.cuotasTarjetaPagadasKeys,
      tipoCambioPesosPorUsd: s.tipoCambioPesosPorUsd,
      ahorroMetas: s.ahorroMetas,
    };
    const push = await pushPersistedSnapshotToSupabase(snapshot);
    if (push.ok) {
      localStorage.removeItem(OLD_STORAGE_KEY);
      const fresh = await fetchAllData();
      set({
        weeklyRecords: recomputeWeeklyRecords(fresh.weeklyRecords),
        installmentPurchases: fresh.installmentPurchases
          .map(normalizeInstallmentPurchase)
          .filter((x): x is InstallmentPurchase => x != null),
        tarjetas: fresh.tarjetas
          .map(normalizeTarjetaCredito)
          .filter((x): x is TarjetaCredito => x != null),
        cuotasTarjetaPagadasKeys: fresh.cuotasTarjetaPagadasKeys,
        tipoCambioPesosPorUsd: fresh.tipoCambioPesosPorUsd,
        ahorroMetas: fresh.ahorroMetas,
        cloudSyncError: null,
      });
    } else {
      set({
        cloudSyncError: `No se pudo sincronizar: ${push.error}`,
      });
    }
  },

  clearCloudSyncError: () => set({ cloudSyncError: null }),

  /* ---------------------------------------------------------------- */
  /*  Setters masivos (rara vez usados fuera de init)                 */
  /* ---------------------------------------------------------------- */
  setWeeklyRecords: (records) => {
    const recomputed = recomputeWeeklyRecords(records);
    set({ weeklyRecords: recomputed });
    void dbUpsertWeekly(recomputed);
  },

  setInstallmentPurchases: (items) => {
    const normalized = items
      .map(normalizeInstallmentPurchase)
      .filter((x): x is InstallmentPurchase => x != null);
    set({ installmentPurchases: normalized });
    void dbUpsertInstallments(normalized);
  },

  setTarjetas: (items) => {
    const normalized = items
      .map(normalizeTarjetaCredito)
      .filter((x): x is TarjetaCredito => x != null);
    set({ tarjetas: normalized });
    void dbUpsertTarjetas(normalized);
  },

  /* ---------------------------------------------------------------- */
  /*  Weekly records                                                  */
  /* ---------------------------------------------------------------- */
  saveWeeklySnapshot: ({
    fechaISO,
    efectivoMinorUnits,
    transferenciaMinorUnits,
    ingresoExtraMinorUnits,
  }) => {
    set((state) => {
      const existing = state.weeklyRecords.find(
        (r) => r.fechaISO === fechaISO
      );
      const id = existing?.id ?? crypto.randomUUID();
      const creadoEn = existing?.creadoEn ?? new Date().toISOString();

      const rest = state.weeklyRecords.filter(
        (r) => r.fechaISO !== fechaISO
      );
      const draft: WeeklyExpenseRecord = {
        id,
        fechaISO,
        efectivoMinorUnits,
        transferenciaMinorUnits,
        ingresoExtraMinorUnits,
        totalMinorUnits: 0,
        gastoSemanalMinorUnits: null,
        creadoEn,
      };

      const weeklyRecords = recomputeWeeklyRecords([...rest, draft]);
      return { weeklyRecords };
    });
    void dbUpsertWeekly(get().weeklyRecords);
  },

  deleteWeeklyRecordById: (id) => {
    set((state) => ({
      weeklyRecords: recomputeWeeklyRecords(
        state.weeklyRecords.filter((r) => r.id !== id)
      ),
    }));
    void dbDeleteWeekly(id);
    void dbUpsertWeekly(get().weeklyRecords);
  },

  /* ---------------------------------------------------------------- */
  /*  Installment purchases                                           */
  /* ---------------------------------------------------------------- */
  addInstallmentPurchase: ({
    descripcion,
    totalMinorUnits,
    numeroCuotas,
    inicioMesISO,
    tarjetaId,
    moneda,
  }) => {
    const d = descripcion.trim();
    const n = Math.floor(numeroCuotas);
    if (
      !d ||
      totalMinorUnits < 1 ||
      n < 1 ||
      !/^\d{4}-\d{2}$/.test(inicioMesISO)
    )
      return;

    const tid = tarjetaId && tarjetaId.length > 0 ? tarjetaId : null;
    const m: MonedaCuota = moneda === "USD" ? "USD" : "CLP";
    const cuotaMinorUnits = cuotaMinorUnitsFromTotal(totalMinorUnits, n);

    const newPurchase: InstallmentPurchase = {
      id: crypto.randomUUID(),
      descripcion: d,
      totalMinorUnits,
      numeroCuotas: n,
      cuotaMinorUnits,
      inicioMesISO,
      tarjetaId: tid,
      moneda: m,
      creadoEn: new Date().toISOString(),
    };

    set((s) => ({
      installmentPurchases: [...s.installmentPurchases, newPurchase],
    }));
    void dbUpsertInstallment(newPurchase);
  },

  updateInstallmentPurchase: (id, input) => {
    const d = input.descripcion.trim();
    const n = Math.floor(input.numeroCuotas);
    if (
      !d ||
      input.totalMinorUnits < 1 ||
      n < 1 ||
      !/^\d{4}-\d{2}$/.test(input.inicioMesISO)
    )
      return;

    const tid =
      input.tarjetaId && input.tarjetaId.length > 0
        ? input.tarjetaId
        : null;
    const m: MonedaCuota = input.moneda === "USD" ? "USD" : "CLP";
    const cuotaMinorUnits = cuotaMinorUnitsFromTotal(
      input.totalMinorUnits,
      n
    );

    set((s) => ({
      installmentPurchases: s.installmentPurchases.map((p) =>
        p.id === id
          ? {
              ...p,
              descripcion: d,
              totalMinorUnits: input.totalMinorUnits,
              numeroCuotas: n,
              cuotaMinorUnits,
              inicioMesISO: input.inicioMesISO,
              tarjetaId: tid,
              moneda: m,
            }
          : p
      ),
    }));

    const updated = get().installmentPurchases.find((p) => p.id === id);
    if (updated) void dbUpsertInstallment(updated);
  },

  /* ---------------------------------------------------------------- */
  /*  Tarjetas                                                        */
  /* ---------------------------------------------------------------- */
  addTarjeta: (nombre) => {
    const n = nombre.trim();
    if (!n) return;
    const t: TarjetaCredito = {
      id: crypto.randomUUID(),
      nombre: n,
      creadoEn: new Date().toISOString(),
    };
    set((s) => ({ tarjetas: [...s.tarjetas, t] }));
    void dbUpsertTarjeta(t);
  },

  removeTarjeta: (id) => {
    set((s) => ({
      tarjetas: s.tarjetas.filter((t) => t.id !== id),
      installmentPurchases: s.installmentPurchases.map((p) =>
        p.tarjetaId === id ? { ...p, tarjetaId: null } : p
      ),
    }));
    void dbDeleteTarjeta(id);
  },

  setInstallmentTarjetaId: (installmentId, tarjetaId) => {
    const tid =
      tarjetaId && tarjetaId.length > 0 ? tarjetaId : null;
    set((s) => ({
      installmentPurchases: s.installmentPurchases.map((p) =>
        p.id === installmentId ? { ...p, tarjetaId: tid } : p
      ),
    }));
    const updated = get().installmentPurchases.find(
      (p) => p.id === installmentId
    );
    if (updated) void dbUpsertInstallment(updated);
  },

  /* ---------------------------------------------------------------- */
  /*  Cuotas pagadas                                                  */
  /* ---------------------------------------------------------------- */
  togglePagoTarjetaMes: (mesISO, tarjetaId, moneda) => {
    const key = pagoTarjetaMesKey(mesISO, tarjetaId, moneda);
    let adding = false;
    set((s) => {
      const has = s.cuotasTarjetaPagadasKeys.includes(key);
      adding = !has;
      return {
        cuotasTarjetaPagadasKeys: has
          ? s.cuotasTarjetaPagadasKeys.filter((k) => k !== key)
          : [...s.cuotasTarjetaPagadasKeys, key],
      };
    });
    if (adding) {
      void insertPagadaKey(key);
    } else {
      void deletePagadaKey(key);
    }
  },

  /* ---------------------------------------------------------------- */
  /*  Preferencias                                                    */
  /* ---------------------------------------------------------------- */
  setTipoCambioPesosPorUsd: (valor) => {
    const safe =
      Number.isFinite(valor) && valor > 0 && valor < 1e6
        ? Math.round(valor * 100) / 100
        : 1450;
    set({ tipoCambioPesosPorUsd: safe });
    void upsertSetting("tipoCambioPesosPorUsd", String(safe));
  },

  setMesCuotasVistaISO: (mesISO) => {
    if (typeof mesISO === "string" && /^\d{4}-\d{2}$/.test(mesISO)) {
      set({ mesCuotasVistaISO: mesISO });
    }
  },

  setAhorroMetas: (config) => {
    const next = normalizeAhorroMetasPayload(config);
    set({ ahorroMetas: next });
    void upsertSetting("ahorroMetas", JSON.stringify(next));
  },
}));

/* -------------------------------------------------------------------- */
/*  localStorage (Zustand persist legado)                               */
/* -------------------------------------------------------------------- */

function snapshotHasUserData(s: PersistedExpenseSnapshot): boolean {
  return (
    s.weeklyRecords.length > 0 ||
    s.installmentPurchases.length > 0 ||
    s.tarjetas.length > 0 ||
    s.cuotasTarjetaPagadasKeys.length > 0 ||
    s.tipoCambioPesosPorUsd !== 1450
  );
}

function parseLocalStorageSnapshot(): {
  snapshot: PersistedExpenseSnapshot;
  raw: string;
} | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(OLD_STORAGE_KEY);
  if (!raw) return null;

  try {
    const local = JSON.parse(raw)?.state;
    if (!local) return null;

    const weeklyRecords: WeeklyExpenseRecord[] = Array.isArray(
      local.weeklyRecords
    )
      ? recomputeWeeklyRecords(local.weeklyRecords)
      : [];

    const tarjetas: TarjetaCredito[] = Array.isArray(local.tarjetas)
      ? local.tarjetas
          .map(normalizeTarjetaCredito)
          .filter((x: unknown): x is TarjetaCredito => x != null)
      : [];

    const tarjetaIds = new Set(tarjetas.map((t) => t.id));
    const installmentPurchases: InstallmentPurchase[] = Array.isArray(
      local.installmentPurchases
    )
      ? local.installmentPurchases
          .map(normalizeInstallmentPurchase)
          .filter(
            (x: unknown): x is InstallmentPurchase => x != null
          )
          .map((p: InstallmentPurchase) =>
            p.tarjetaId && !tarjetaIds.has(p.tarjetaId)
              ? { ...p, tarjetaId: null }
              : p
          )
      : [];

    const cuotasTarjetaPagadasKeys: string[] = Array.isArray(
      local.cuotasTarjetaPagadasKeys
    )
      ? local.cuotasTarjetaPagadasKeys
      : [];

    let tipoCambioPesosPorUsd = 1450;
    if (
      typeof local.tipoCambioPesosPorUsd === "number" &&
      Number.isFinite(local.tipoCambioPesosPorUsd) &&
      local.tipoCambioPesosPorUsd > 0
    ) {
      tipoCambioPesosPorUsd = local.tipoCambioPesosPorUsd;
    }

    const ahorroMetas = normalizeAhorroMetasPayload(local.ahorroMetas);

    return {
      raw,
      snapshot: {
        weeklyRecords,
        installmentPurchases,
        tarjetas,
        cuotasTarjetaPagadasKeys,
        tipoCambioPesosPorUsd,
        ahorroMetas,
      },
    };
  } catch (err) {
    console.error("Error al leer localStorage:", err);
    return null;
  }
}
