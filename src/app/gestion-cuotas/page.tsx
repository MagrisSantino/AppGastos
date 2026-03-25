import type { Metadata } from "next";

import { GestionCuotasView } from "./gestion-cuotas-view";

export const metadata: Metadata = {
  title: "Gestión de cuotas",
};

export default function GestionCuotasPage() {
  return <GestionCuotasView />;
}
