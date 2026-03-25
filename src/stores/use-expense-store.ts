import { format, startOfMonth } from "date-fns";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { pagoTarjetaMesKey } from "@/lib/cuotas-tarjeta-pagos";
import {
  cuotaMinorUnitsFromTotal,
  normalizeInstallmentPurchase,
  normalizeTarjetaCredito,
} from "@/lib/installments";
import { recomputeWeeklyRecords } from "@/lib/weekly-records";
import type {
  InstallmentPurchase,
  MonedaCuota,
  TarjetaCredito,
  WeeklyExpenseRecord,
} from "@/types/expenses";

const STORAGE_KEY = "control-gastos:store-v2";

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
  setWeeklyRecords: (records: WeeklyExpenseRecord[]) => void;
  setInstallmentPurchases: (items: InstallmentPurchase[]) => void;
  setTarjetas: (items: TarjetaCredito[]) => void;
  saveWeeklySnapshot: (input: SaveWeeklySnapshotInput) => void;
  deleteWeeklyRecordById: (id: string) => void;
  addInstallmentPurchase: (input: AddInstallmentInput) => void;
  updateInstallmentPurchase: (id: string, input: AddInstallmentInput) => void;
  addTarjeta: (nombre: string) => void;
  removeTarjeta: (id: string) => void;
  setInstallmentTarjetaId: (installmentId: string, tarjetaId: string | null) => void;
  cuotasTarjetaPagadasKeys: string[];
  togglePagoTarjetaMes: (
    mesISO: string,
    tarjetaId: string | null,
    moneda: MonedaCuota
  ) => void;
  /** Pesos por 1 USD: solo para escala unificada del gráfico de cuotas (CLP/USD mezclados). */
  tipoCambioPesosPorUsd: number;
  setTipoCambioPesosPorUsd: (valor: number) => void;
  /** Mes en formato `yyyy-MM` para la vista «por tarjeta» en gestión de cuotas. */
  mesCuotasVistaISO: string;
  setMesCuotasVistaISO: (mesISO: string) => void;
};

export const useExpenseStore = create<ExpenseStoreState>()(
  persist(
    (set) => ({
      weeklyRecords: [],
      installmentPurchases: [],
      tarjetas: [],
      cuotasTarjetaPagadasKeys: [],
      tipoCambioPesosPorUsd: 1450,
      setTipoCambioPesosPorUsd: (valor) =>
        set({
          tipoCambioPesosPorUsd:
            Number.isFinite(valor) && valor > 0 && valor < 1e6
              ? Math.round(valor * 100) / 100
              : 1450,
        }),
      mesCuotasVistaISO: mesCuotasVistaInicial(),
      setMesCuotasVistaISO: (mesISO) => {
        if (typeof mesISO === "string" && /^\d{4}-\d{2}$/.test(mesISO)) {
          set({ mesCuotasVistaISO: mesISO });
        }
      },
      setWeeklyRecords: (weeklyRecords) =>
        set({ weeklyRecords: recomputeWeeklyRecords(weeklyRecords) }),
      setInstallmentPurchases: (installmentPurchases) =>
        set({
          installmentPurchases: installmentPurchases
            .map(normalizeInstallmentPurchase)
            .filter((x): x is InstallmentPurchase => x != null),
        }),
      setTarjetas: (tarjetas) =>
        set({
          tarjetas: tarjetas
            .map(normalizeTarjetaCredito)
            .filter((x): x is TarjetaCredito => x != null),
        }),
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

          const rest = state.weeklyRecords.filter((r) => r.fechaISO !== fechaISO);
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
      },
      deleteWeeklyRecordById: (id) => {
        set((state) => ({
          weeklyRecords: recomputeWeeklyRecords(
            state.weeklyRecords.filter((r) => r.id !== id)
          ),
        }));
      },
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
        ) {
          return;
        }
        const tid =
          tarjetaId && tarjetaId.length > 0 ? tarjetaId : null;
        const m: MonedaCuota = moneda === "USD" ? "USD" : "CLP";
        const cuotaMinorUnits = cuotaMinorUnitsFromTotal(totalMinorUnits, n);
        set((s) => ({
          installmentPurchases: [
            ...s.installmentPurchases,
            {
              id: crypto.randomUUID(),
              descripcion: d,
              totalMinorUnits,
              numeroCuotas: n,
              cuotaMinorUnits,
              inicioMesISO,
              tarjetaId: tid,
              moneda: m,
              creadoEn: new Date().toISOString(),
            },
          ],
        }));
      },
      updateInstallmentPurchase: (id, input) => {
        const d = input.descripcion.trim();
        const n = Math.floor(input.numeroCuotas);
        if (
          !d ||
          input.totalMinorUnits < 1 ||
          n < 1 ||
          !/^\d{4}-\d{2}$/.test(input.inicioMesISO)
        ) {
          return;
        }
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
      },
      addTarjeta: (nombre) => {
        const n = nombre.trim();
        if (!n) return;
        set((s) => ({
          tarjetas: [
            ...s.tarjetas,
            {
              id: crypto.randomUUID(),
              nombre: n,
              creadoEn: new Date().toISOString(),
            },
          ],
        }));
      },
      removeTarjeta: (id) => {
        set((s) => ({
          tarjetas: s.tarjetas.filter((t) => t.id !== id),
          installmentPurchases: s.installmentPurchases.map((p) =>
            p.tarjetaId === id ? { ...p, tarjetaId: null } : p
          ),
        }));
      },
      setInstallmentTarjetaId: (installmentId, tarjetaId) => {
        const tid =
          tarjetaId && tarjetaId.length > 0 ? tarjetaId : null;
        set((s) => ({
          installmentPurchases: s.installmentPurchases.map((p) =>
            p.id === installmentId ? { ...p, tarjetaId: tid } : p
          ),
        }));
      },
      togglePagoTarjetaMes: (mesISO, tarjetaId, moneda) => {
        const key = pagoTarjetaMesKey(mesISO, tarjetaId, moneda);
        set((s) => {
          const arr = s.cuotasTarjetaPagadasKeys;
          const has = arr.includes(key);
          return {
            cuotasTarjetaPagadasKeys: has
              ? arr.filter((k) => k !== key)
              : [...arr, key],
          };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        weeklyRecords: state.weeklyRecords,
        installmentPurchases: state.installmentPurchases,
        tarjetas: state.tarjetas,
        cuotasTarjetaPagadasKeys: state.cuotasTarjetaPagadasKeys,
        tipoCambioPesosPorUsd: state.tipoCambioPesosPorUsd,
        mesCuotasVistaISO: state.mesCuotasVistaISO,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (
          typeof state.mesCuotasVistaISO !== "string" ||
          !/^\d{4}-\d{2}$/.test(state.mesCuotasVistaISO)
        ) {
          state.mesCuotasVistaISO = mesCuotasVistaInicial();
        }
        if (
          typeof state.tipoCambioPesosPorUsd !== "number" ||
          !Number.isFinite(state.tipoCambioPesosPorUsd) ||
          state.tipoCambioPesosPorUsd <= 0
        ) {
          state.tipoCambioPesosPorUsd = 1450;
        }
        state.cuotasTarjetaPagadasKeys = Array.isArray(
          state.cuotasTarjetaPagadasKeys
        )
          ? state.cuotasTarjetaPagadasKeys
          : [];
        state.installmentPurchases = (state.installmentPurchases ?? [])
          .map(normalizeInstallmentPurchase)
          .filter((x): x is InstallmentPurchase => x != null);
        state.tarjetas = (state.tarjetas ?? [])
          .map(normalizeTarjetaCredito)
          .filter((x): x is TarjetaCredito => x != null);
      },
    }
  )
);
